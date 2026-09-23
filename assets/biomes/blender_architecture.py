"""Deterministic architectural reconstruction with source-derived texture tiles.

Z-up authoring, -Y front. Every primitive is a closed orientable solid. Separate
interpenetrating joinery is intentional; no zero-thickness exterior wall cards.
Large faces are tessellated only at texture-repeat boundaries, never displaced.
"""
import bpy, bmesh, math, json, os, urllib.request, random
from mathutils import Vector, Matrix
TILES={'brick':0,'limestone':1,'siding':2,'redwood':3,'slate':4,'timber':5,'concrete':6,'steel':7,'glass':8,'trim':9,'greenmetal':10,'copper':11,'fieldstone':12,'darkbrick':13,'felt':14,'soot':15}

class Architecture:
    def __init__(self,name,quality):
        self.name=name;self.quality=quality;self.vertices=[];self.faces=[];self.uv=[];self.smooth=[];self.parts=[];self.part=0;self.r=random.Random(name)
    def polygon(self,coords,uv,material,smooth=False):
        start=len(self.vertices);self.vertices.extend(coords);self.faces.append(tuple(range(start,start+len(coords))))
        tile=TILES[material];pad=2/2048
        self.uv.append([((tile%4)/4+pad+u*(.25-2*pad),1-(tile//4+1)/4+pad+v*(.25-2*pad)) for u,v in uv])
        self.smooth.append(smooth);self.parts.append(self.part)
    def box(self,p,s,mat,rotation=0,axis='Z'):
        self.part+=1
        p=Vector(p);rot=Matrix.Rotation(rotation,3,axis);size=Vector(s)
        if min(size)<=0:raise ValueError('Nonpositive box dimensions')
        # Axis frames have cross(U,V) = outward normal, with V vertical on walls.
        frames=[((1,0,0),(0,1,0),(0,0,1),0,1,2),((-1,0,0),(0,-1,0),(0,0,1),0,1,2),
                ((0,1,0),(-1,0,0),(0,0,1),1,0,2),((0,-1,0),(1,0,0),(0,0,1),1,0,2),
                ((0,0,1),(1,0,0),(0,1,0),2,0,1),((0,0,-1),(-1,0,0),(0,1,0),2,0,1)]
        for n,u,v,ni,ui,vi in frames:
            n,u,v=Vector(n),Vector(u),Vector(v);w,h=size[ui],size[vi]
            nx=max(1,math.ceil(w/2));ny=max(1,math.ceil(h/2))
            for i in range(nx):
                for j in range(ny):
                    x0=-w/2+i*w/nx;x1=x0+w/nx;y0=-h/2+j*h/ny;y1=y0+h/ny
                    coords=[p+rot@(n*size[ni]/2+u*x+v*y) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
                    uv=[(0,0),(w/nx/2,0),(w/nx/2,h/ny/2),(0,h/ny/2)]
                    if mat=='slate' and ni==2 and axis=='Y' and abs(rotation)>1e-6:
                        # U follows the ridge; V climbs from eave to ridge on both slopes.
                        uv=[(v,u if coords[1].z>=coords[0].z else 1-u) for u,v in uv]
                        assert (coords[1].z-coords[0].z)*(uv[1][1]-uv[0][1]) >= 0, 'Roof UV V must climb toward the ridge'
                    self.polygon(coords,uv,mat)
    def beam(self,a,b,r,mat,sides=8):
        self.part+=1;a,b=Vector(a),Vector(b);direction=b-a
        z=direction.normalized();u=z.cross(Vector((0,0,1)))
        if u.length<.1:u=z.cross(Vector((0,1,0)))
        u.normalize();v=z.cross(u).normalized();length=direction.length
        rings=[[c+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)) for i in range(sides)] for c in [a,b]]
        for i in range(sides):
            k=(i+1)%sides
            self.polygon([rings[0][i],rings[0][k],rings[1][k],rings[1][i]],[(0,0),(.15,0),(.15,min(1,length/2)),(0,min(1,length/2))],mat,True)
        for ring,reverse in [(rings[0],True),(rings[1],False)]:
            points=list(reversed(ring)) if reverse else ring
            self.polygon(points,[(.5+.45*math.cos(i*math.tau/sides),.5+.45*math.sin(i*math.tau/sides)) for i in range(sides)],mat)
    def roof(self,x,y,w,d,z,rise,mat='slate',trim='trim'):
        # Closed gable prism, plus two independent planar roof slabs.
        self.part+=1
        a=[(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x,y-d/2,z+rise)]
        b=[(px,y+d/2,pz) for px,_,pz in a]
        for pts in [a,list(reversed(b))]:self.polygon(pts,[(0,0),(1,0),(.5,1)],trim)
        for i,j in [(0,1),(1,2),(2,0)]:self.polygon([a[i],b[i],b[j],a[j]],[(0,0),(1,0),(1,1),(0,1)],trim)
        angle=math.atan2(rise,w/2);length=math.hypot(rise,w/2)
        for sign in [-1,1]:
            self.box((x+sign*w/4,y,z+rise/2+.025),(length+.24,d+.35,.10),mat,sign*angle,'Y')
            # A restrained fascia at each gable, aligned exactly with its roof plane.
            for front in [-1,1]:self.box((x+sign*w/4,y+front*(d/2+.18),z+rise/2),(length+.25,.08,.14),trim,sign*angle,'Y')
        self.box((x,y,z+rise+.08),(.14,d+.4,.12),mat)
    def local_box(self,u,v,z,w,t,h,mat,side,distance):
        if side in [0,2]:self.box((u,(-1 if side==0 else 1)*(distance+v),z),(w,t,h),mat)
        else:self.box(((-1 if side==3 else 1)*(distance+v),u,z),(t,w,h),mat)
    def window(self,u,z,w,h,side,distance,trim='trim',bars=True):
        # Glazing sits behind the frame. Closed shadow recess prevents see-through.
        self.local_box(u,-.07,z,w,.12,h,'steel',side,distance)
        self.local_box(u,-.001,z,w-.08,.025,h-.08,'glass',side,distance)
        for du in [-w/2,w/2]:self.local_box(u+du,.025,z,.09,.11,h+.12,trim,side,distance)
        for dz in [-h/2,h/2]:self.local_box(u,.025,z+dz,w+.09,.11,.09,trim,side,distance)
        if bars:
            self.local_box(u,.04,z,.045,.06,h-.08,'steel',side,distance)
            self.local_box(u,.04,z,w-.08,.06,.045,'steel',side,distance)
        self.local_box(u,.10,z-h/2-.06,w+.26,.30,.12,trim,side,distance)
        self.local_box(u,.04,z+h/2+.11,w+.20,.19,.15,trim,side,distance)
    def wall(self,width,depth,base,height,floors,bays,mat,trim='trim',window_ratio=.50):
        level=height/floors;thick=.22
        for side in range(4):
            span=width if side in [0,2] else depth;distance=(depth if side in [0,2] else width)/2
            count=bays if side in [0,2] else max(2,round(bays*depth/width));cell=span/count
            ww=cell*window_ratio;wh=level*.55
            for floor in range(floors):
                bottom=base+floor*level;cz=bottom+level*.51
                for bay in range(count):
                    u=-span/2+(bay+.5)*cell
                    # Partition the facade into solid piers, sill panels and headers.
                    for sign in [-1,1]:self.local_box(u+sign*(cell+ww)/4,-thick/2,bottom+level/2,(cell-ww)/2,thick,level,mat,side,distance)
                    low=cz-wh/2-bottom;upper=bottom+level-(cz+wh/2)
                    self.local_box(u,-thick/2,bottom+low/2,ww,thick,low,mat,side,distance)
                    self.local_box(u,-thick/2,bottom+level-upper/2,ww,thick,upper,mat,side,distance)
                    self.window(u,cz,ww,wh,side,distance,trim)
        self.box((0,0,base-.1),(width+.12,depth+.12,.2),'fieldstone')
    def bands(self,w,d,z,mat='limestone'):
        for dz,over,h in [(0,.1,.13),(.12,.25,.12),(.25,.42,.14)]:
            # Four closed edge beams, with a recessed horizontal roof surface.
            for sign in [-1,1]:
                self.box((sign*(w/2+over/2-.08),0,z+dz),(.16+over,d+over,h),mat)
                self.box((0,sign*(d/2+over/2-.08),z+dz),(w+over,.16+over,h),mat)
    def city(self,office=False):
        w=6.4 if office else 5.2;d=5.2;h=11.4 if office else 12.8;floors=5
        mat='limestone' if office else 'brick';trim='limestone'
        self.wall(w,d,1.8,h-1.8,floors,4 if office else 3,mat,trim,.53)
        self.wall(w,d,.35,1.45,1,3,mat,'steel',.73)
        for z in [.25,1.8,h]:self.bands(w,d,z,trim)
        self.box((0,0,h+.08),(w-.18,d-.18,.14),'felt')
        # Parapet and roof plant stay orthogonal to the main shell.
        for sign in [-1,1]:
            self.box((sign*(w/2-.10),0,h+.48),(.20,d,.55),trim)
            self.box((0,sign*(d/2-.10),h+.48),(w,.20,.55),trim)
        self.box((.7,.6,h+.43),(1.7,1.2,.62),'steel')
        for j in range(8):self.box((.7,.1+j*.14,h+.76),(1.6,.035,.04),'limestone')
        if office:
            for side in range(4):
                span=w if side in [0,2] else d;dist=(d if side in [0,2] else w)/2
                count=4 if side in [0,2] else max(2,round(4*d/w))
                for u in [-span/2+.17]+[-span/2+j*span/count for j in range(1,count)]+[span/2-.17]:
                    self.local_box(u,.055,(h+1.8)/2,.20,.22,h-1.8,'trim',side,dist)
            for z in [3.7,7.5,9.4]:self.bands(w,d,z,trim)
        else:
            for f in range(floors):
                z=2.2+f*(h-1.8)/floors
                self.box((0,-d/2-.52,z),(w*.83,.98,.10),'steel')
                for x in [-w*.41,w*.41]:self.beam((x,-d/2-1,z),(x,-d/2-1,z+.7),.025,'steel',6)
                for z2 in [z+.38,z+.74]:self.beam((-w*.41,-d/2-1,z2),(w*.41,-d/2-1,z2),.025,'steel',6)
                for x in [i*.25-w*.4 for i in range(int(w*.8/.25)+1)]:self.beam((x,-d/2-1,z),(x,-d/2-1,z+.75),.014,'steel',5)
                if f<floors-1:
                    for i in range(12):self.box((-.9+i*.16,-d/2-.52,z+i*.157),(.28,.65,.04),'steel')
            for side in [0,1]:
                span=w if side==0 else d;distance=d/2 if side==0 else w/2
                self.local_box(0,.35,1.86,span+.25,.85,.13,'greenmetal',side,distance)
                self.local_box(0,.77,1.69,span+.25,.07,.32,'greenmetal',side,distance)
        self.box((0,0,.12),(w+.45,d+.45,.24),'fieldstone')
    def house(self,cottage=False):
        w=6;d=5;h=3.5 if cottage else 4.9;mat='brick' if cottage else 'siding'
        self.wall(w,d,.35,h-.35,1 if cottage else 2,3,mat,'trim',.44)
        if cottage:
            start=len(self.vertices);self.roof(0,0,d,w,h,2.1,'slate','timber')
            for i in range(start,len(self.vertices)):
                p=Vector(self.vertices[i]);self.vertices[i]=Vector((-p.y,p.x,p.z))
        else:self.roof(0,0,w,d,h,1.7,'slate','trim')
        # Covered entrance porch, steps, posts and balustrades.
        self.box((0,-d/2-.80,.36),(w*.83,1.8,.24),'fieldstone')
        for j in range(3):self.box((0,-d/2-1.7-j*.25,.28-j*.075),(1.8,.52,.16),'limestone')
        for x in [-w*.37,w*.37]:
            self.box((x,-d/2-1.38,1.50),(.14,.14,2.1),'trim' if not cottage else 'timber')
            self.box((x,-d/2-1.38,.50),(.28,.28,.22),'fieldstone')
        if cottage:
            self.box((0,-d/2-.72,2.7),(w*.92,1.95,.12),'slate',.16,'X')
            for x in [-1.7,0,1.7]:
                self.box((x,-.9,h+1.0),(.95,1.1,.85),'timber')
                self.window(x,h+1.05,.56,.62,0,1.46,'trim')
                self.roof(x,-.9,1.18,1.3,h+1.40,.55,'slate','timber')
        else:
            self.roof(0,-d/2-.75,3,1.9,2.65,.8,'slate','trim')
        for x in [-w*.37,w*.37]:
            for j in range(6):self.box((x,-d/2-.3-j*.2,.94),(.06,.06,.85),'trim')
            self.box((x,-d/2-.9,1.38),(.1,1.4,.10),'trim')
        for x in ([-2.2,2.2] if cottage else [-2.2]):
            self.box((x,1,h+1.8),(.55,.65,2),'brick')
            self.box((x,1,h+2.82),(.72,.82,.15),'limestone')
            self.box((x,1,h+2.9),(.35,.45,.025),'steel')
        # Front door covers a deliberately framed central entrance bay.
        self.local_box(0,.06,1.17,1.0,.2,1.65,'timber',0,d/2)
        self.local_box(.31,.18,1.1,.045,.04,.13,'copper',0,d/2)
    def barn(self,stone=False):
        w=8.2;d=5;h=3.3;mat='fieldstone' if stone else 'redwood'
        self.box((0,0,h/2+.2),(w,d,h),mat)
        self.box((0,0,.20),(w+.2,d+.2,.4),'fieldstone')
        # Ridge runs across the long dimension, unlike the house roof.
        start=len(self.vertices);self.roof(0,0,d,w,h+.2,2.25,'slate','limestone' if stone else 'redwood')
        for i in range(start,len(self.vertices)):
            p=Vector(self.vertices[i]);self.vertices[i]=Vector((-p.y,p.x,p.z))
        for u in [-2.3,2.3]:
            self.local_box(u,.05,1.45,2.25,.18,2.5,'timber' if stone else 'redwood',0,d/2)
            for du in [-1.16,1.16]:self.local_box(u+du,.16,1.50,.13,.14,2.7,'limestone' if stone else 'trim',0,d/2)
            self.local_box(u,.17,2.89,2.5,.14,.14,'limestone' if stone else 'trim',0,d/2)
            self.local_box(u,.17,1.48,.08,.07,2.5,'steel',0,d/2)
            for sign in [-1,1]:
                self.beam((u+sign*1.05,-d/2-.20,.3),(u-sign*1.05,-d/2-.20,2.60),.05,'timber' if stone else 'trim',4)
        for side in [1,3]:self.window(0,3.4,.8,.85,side,w/2,'trim')
        if not stone:
            # Center cross gable preserves the red barn's multi-gable identity.
            self.box((0,-d/2+.65,h+.35),(2.3,2.0,1.0),'redwood')
            self.roof(0,-d/2+.65,2.7,2.2,h+.85,1.2,'slate','trim')
            self.window(0,h+.4,.65,.8,0,d/2+.36,'trim')
        else:
            self.box((-.8,-.9,h+1.15),(1.0,1.1,.9),'timber')
            self.window(-.8,h+1.15,.6,.65,0,1.47,'trim')
            self.roof(-.8,-.9,1.25,1.4,h+1.62,.6,'slate','trim')
    def cabin(self):
        w=5;d=4.7;h=2.8
        self.box((0,0,.16),(w+.4,d+.4,.32),'fieldstone')
        # Closed supporting shell, with cylindrical log courses outside it.
        self.box((0,0,1.5),(w-.16,d-.16,2.6),'timber')
        for i in range(11):
            z=.38+i*.24
            for sign in [-1,1]:
                self.beam((-w/2-.17,sign*d/2,z),(w/2+.17,sign*d/2,z),.145,'timber',10)
                self.beam((sign*w/2,-d/2-.25,z+.03),(sign*w/2,d/2+.25,z+.03),.145,'timber',10)
        self.roof(0,0,w+.3,d+.3,h,1.9,'slate','timber')
        for side in range(4):
            dist=(d if side in [0,2] else w)/2+.14
            for u in [-1.35,1.35]:self.window(u,1.65,.90,.95,side,dist,'timber')
        self.box((0,-d/2-.9,.32),(3.8,1.8,.16),'timber')
        self.roof(0,-d/2-.85,2.9,2.0,2.30,.7,'slate','timber')
        for x in [-1.25,1.25]:self.beam((x,-d/2-1.6,.4),(x,-d/2-1.6,2.35),.11,'timber',10)
        self.local_box(0,.17,1.25,.92,.16,1.95,'timber',0,d/2)
        for j in range(2):self.box((0,-d/2-1.9-j*.28,.20-j*.07),(1.7,.45,.16),'timber')
        self.box((1.2,.7,h+1.65),(.6,.7,1.8),'fieldstone')
    def slab(self,outline,z,height,mat):
        self.part+=1
        bottom=[Vector((x,y,z)) for x,y in outline];top=[v+Vector((0,0,height)) for v in bottom]
        for ring,reverse in [(bottom,True),(top,False)]:
            pts=list(reversed(ring)) if reverse else ring
            self.polygon(pts,[((v.x+5)/10,(v.y+5)/10) for v in pts],mat)
        for i in range(len(outline)):
            j=(i+1)%len(outline)
            self.polygon([bottom[i],bottom[j],top[j],top[i]],[(0,0),(.5,0),(.5,height/2),(0,height/2)],mat)
    def arch(self,x,y,z,radius,depth,mat):
        # Closed voussoirs: radial joints are intentional masonry seams.
        for i in range(12):
            self.part+=1;a=i*math.pi/12;b=(i+1)*math.pi/12
            front=[Vector((x+r*math.cos(t),y-depth/2,z+r*math.sin(t))) for r,t in [(radius,a),(radius+.22,a),(radius+.22,b),(radius,b)]]
            back=[p+Vector((0,depth,0)) for p in front]
            self.polygon(front,[(0,0),(1,0),(1,1),(0,1)],mat)
            self.polygon(list(reversed(back)),[(0,0),(1,0),(1,1),(0,1)],mat)
            for j in range(4):
                k=(j+1)%4;self.polygon([front[j],back[j],back[k],front[k]],[(0,0),(1,0),(1,1),(0,1)],mat)
    def ruin(self,arcade=False):
        w=8;d=4.7;levels=1 if arcade else 3;story=2.5
        self.box((0,0,.13),(w+.3,d+.3,.26),'soot')
        outline=[(-w/2,-d/2),(w/2-.5,-d/2),(w/2,-d/2+.4),(w/2,d/2-1),(w/2-.45,d/2-.7),(w/2-.6,d/2),(-w/2+.2,d/2),(-w/2,d/2-.5)]
        for f in range(levels):
            z=.3+f*story
            for x in [-3.8,-1.27,1.27,3.8]:
                for y in [-d/2+.15,d/2-.15]:self.box((x,y,z+story/2),(.32,.36,story),'concrete')
            broken=outline
            if not arcade and f==1:broken=[(-4,-2.35),(1.5,-2.35),(2.1,-1.5),(4,-.6),(4,2.35),(-4,2.35)]
            if not arcade and f==2:broken=[(-4,-2.35),(-1.5,-2.35),(-1.2,-1.6),(.2,-1.4),(.5,-.5),(2,-.2),(2.7,.7),(4,1.1),(4,2.35),(-4,2.35)]
            self.slab(broken,z+story-.2,.22,'concrete')
            for y in [-d/2+.15,d/2-.15]:self.box((0,y,z+story-.18),(w,.4,.34),'concrete')
            for x in [-3.8,3.8]:self.box((x,0,z+story-.18),(.4,d,.34),'concrete')
            if not arcade:
                # Retain broad planar wall fragments; damage affects their boundary.
                for x in [-3.8,3.8]:
                    self.box((x,.9,z+.7),(.25,2.6,1.4),'soot')
                    for k in range(5):
                        hh=.2+self.r.random()*.7;self.box((x,-.25+k*.5,z+1.4+hh/2),(.25,.5,hh),'concrete')
            if arcade:
                for side in [-1,1]:
                    for i in range(5):
                        x=-3.2+i*1.6
                        self.arch(x,side*(d/2+.02),1.55,.6,.32,'concrete')
                        for sign in [-1,1]:self.box((x+sign*.71,side*d/2,.88),(.23,.35,1.3),'soot')
        if not arcade:
            for x in [-3.8,-1.27,1.27]:
                self.box((x,d/2-.15,levels*story+.6),(.32,.36,1.2),'concrete')
                self.box((x+1.0,d/2-.15,levels*story+1.13),(2.2,.36,.22),'concrete')
        # Rebar and collapsed masonry have deliberate, bounded irregularity.
        for i in range(18):
            x=-3.8+self.r.random()*7.6;y=(-1 if i%2 else 1)*d/2
            self.beam((x,y,levels*story),(x+.12,y+.08,levels*story+.35+self.r.random()*.4),.017,'steel',5)
        for i in range(38):
            x=-w/2+self.r.random()*w;y=-d/2+self.r.random()*d
            size=.15+self.r.random()*.36
            self.box((x,y,.3+size*.4),(size*1.4,size,size*.8),'concrete',self.r.random()*1.2,'Y')
    def tower(self):
        # Wood tank, closed conical roof, iron hoops and cross-braced platform.
        for x in [-1.0,1.0]:
            for y in [-1.0,1.0]:
                self.beam((x*1.25,y*1.25,0),(x,y,2.9),.07,'steel',8)
                self.box((x*1.25,y*1.25,.06),(.32,.32,.12),'copper')
                self.beam((x*1.2,y*1.2,.3),(-x,y,2.7),.035,'steel',6)
        self.beam((0,0,2.75),(0,0,5.1),1.3,'timber',48)
        for z in [2.78,3.0,3.55,4.1,4.7,5.08]:
            for i in range(48):
                a=i*math.tau/48;b=(i+1)*math.tau/48
                self.beam((1.32*math.cos(a),1.32*math.sin(a),z),(1.32*math.cos(b),1.32*math.sin(b),z),.027,'steel',6)
        self.part+=1
        center=Vector((0,0,5.72));ring=[Vector((1.43*math.cos(i*math.tau/48),1.43*math.sin(i*math.tau/48),5.12)) for i in range(48)]
        for i in range(48):
            j=(i+1)%48;self.polygon([ring[i],ring[j],center],[(0,0),(1,0),(.5,1)],'slate',True)
        self.polygon(list(reversed(ring)),[(.5+.45*math.cos(i*math.tau/48),.5+.45*math.sin(i*math.tau/48)) for i in range(48)],'steel')
        for x in [-.23,.23]:self.beam((x,-1.42,.2),(x,-1.42,5.2),.035,'steel',6)
        for i in range(20):self.beam((-.25,-1.42,.3+i*.24),(.25,-1.42,.3+i*.24),.027,'steel',6)
    def kiosk(self):
        # Octagonal cabinet with aligned recessed shutters and a copper dome.
        self.beam((0,0,.12),(0,0,.3),1.25,'limestone',8)
        self.beam((0,0,.3),(0,0,2.95),1.1,'greenmetal',8)
        self.beam((0,0,2.92),(0,0,3.1),1.26,'copper',8)
        for i in range(8):
            a=(i+.5)*math.tau/8;x,y=math.cos(a),math.sin(a)
            self.box((x*1.025,y*1.025,1.60),(.76,.065,2.12),'greenmetal',a-math.pi/2)
            for sign in [-1,1]:
                tangent=Vector((-y,x,0));p=Vector((x*1.07,y*1.07,1.6))+tangent*(sign*.41)
                self.box(p,(.045,.07,2.28),'copper',a-math.pi/2)
            for j in range(12):
                self.box((x*1.075,y*1.075,.65+j*.15),(.70,.045,.045),'trim',a-math.pi/2)
        # Hemispherical rings, with a closed bottom and finite top cap.
        self.part+=1;segments=32;rings=[]
        for j in range(9):
            theta=j*(math.pi/2-.035)/8;r=1.16*math.cos(theta);z=3.08+.95*math.sin(theta)
            rings.append([Vector((r*math.cos(i*math.tau/segments),r*math.sin(i*math.tau/segments),z)) for i in range(segments)])
        for j in range(len(rings)-1):
            for i in range(segments):
                k=(i+1)%segments;self.polygon([rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],[(0,0),(.25,0),(.25,.25),(0,.25)],'greenmetal',True)
        for ring,reverse in [(rings[0],True),(rings[-1],False)]:
            self.polygon(list(reversed(ring)) if reverse else ring,[(.5+.45*math.cos(i*math.tau/segments),.5+.45*math.sin(i*math.tau/segments)) for i in range(segments)],'copper')
        for i in range(8):
            a=i*math.tau/8
            for j in range(8):
                self.beam(rings[j][i*4],rings[j+1][i*4],.026,'copper',6)
        self.beam((0,0,4.0),(0,0,4.35),.07,'copper',12)
    def finish(self):
        scene=bpy.data.scenes.get('Building-'+self.name)
        if scene:
            for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
        else:scene=bpy.data.scenes.new('Building-'+self.name)
        mesh=bpy.data.meshes.new(self.name+'-architectural');mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        uv=mesh.uv_layers.new(name='ArchitecturalUV')
        part=mesh.attributes.new('structural_part','INT','FACE')
        for face,coords,smooth,part_id in zip(mesh.polygons,self.uv,self.smooth,self.parts):
            for li,coord in zip(face.loop_indices,coords):uv.data[li].uv=coord
            face.use_smooth=smooth;part.data[face.index].value=part_id
        # Weld within a solid only. Joinery between separate solids stays explicit.
        bm=bmesh.new();bm.from_mesh(mesh)
        layer=bm.faces.layers.int.get('structural_part');groups={}
        for f in bm.faces:groups.setdefault(f[layer],set()).update(f.verts)
        for verts in groups.values():bmesh.ops.remove_doubles(bm,verts=list(verts),dist=1e-6)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
        obj=bpy.data.objects.new(self.name,mesh);scene.collection.objects.link(obj)
        info=json.loads(self.quality['read']('processed/'+self.name+'.json'))
        # Preserve the old footprint/height envelope and ground anchor exactly.
        points=[v.co for v in mesh.vertices]
        lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
        dims=Vector((info['width'],info['depth'],info['height']))
        for v in mesh.vertices:
            v.co=Vector(((v.co.x-(lo.x+hi.x)/2)*dims.x/(hi.x-lo.x),(v.co.y-(lo.y+hi.y)/2)*dims.y/(hi.y-lo.y),(v.co.z-lo.z)*dims.z/(hi.z-lo.z)))
        mesh.update()
        face_part=mesh.attributes.get('structural_part')
        point_part=mesh.attributes.new('_PART_ID','FLOAT','POINT')
        for face in mesh.polygons:
            for vi in face.vertices:point_part.data[vi].value=face_part.data[face.index].value
        mat=bpy.data.materials.new(self.name+' source-derived architecture');mat.use_nodes=True
        node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        for filename,socket in [('architecture-atlas.png','Base Color'),('architecture-roughness.png','Roughness')]:
            path=os.path.join(self.quality['WORK'],filename)
            if not os.path.exists(path):open(path,'wb').write(self.quality['read']('quality/textures/'+filename))
            im=bpy.data.images.load(path,check_existing=True);im.pack()
            if socket=='Roughness':im.colorspace_settings.name='Non-Color'
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
            mat.node_tree.links.new(tex.outputs['Color'],node.inputs[socket])
        node.inputs['Roughness'].default_value=.8;mesh.materials.append(mat)
        obj['construction']='Closed structural solids, planar walls and roofs; intentional intersecting joinery'
        obj['quality_source']='assets/biomes/blender_architecture.py'
        self.quality['write']('quality/rebuilt/'+self.name+'-construction.json',json.dumps({'id':self.name,'parts':self.part,'faces':len(mesh.polygons),'footprintPreserved':True,'source':'blender_architecture.py'}).encode())
        return scene

def rebuild(name,quality):
    a=Architecture(name,quality)
    if name=='city-kiosk':a.kiosk()
    elif name=='city-water-tower':a.tower()
    elif name.startswith('ash-ruin'):a.ruin(name=='ash-ruin-arcade')
    elif name.startswith('city-'):a.city(name=='city-offices')
    elif name.startswith('suburb-'):a.house(name=='suburb-cottage')
    elif name.startswith('country-'):a.barn(name=='country-barn-stone')
    elif name=='forest-cabin':a.cabin()
    else:raise ValueError(name)
    return a.finish()
