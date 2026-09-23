"""Task-owned Blender scenes, custom creature rigs and authored animation clips.
Loaded in the connected Blender; never clears the user's existing scene.
"""
import bpy, json, math, os, urllib.request, tempfile
import numpy as np
from mathutils import Vector
BRIDGE='http://192.168.8.111:9878'
WORK=os.path.join(tempfile.gettempdir(),'march-bosses-v1')
os.makedirs(WORK,exist_ok=True)
DESIGNS=json.load(urllib.request.urlopen(BRIDGE+'/designs.json'))
CLIPS=[['cleave','execution','heel'],['mortar','needles','shell'],['surgery','restraint','rivets'],['spears','beam','talon'],['palm','eyes','ribs']]
def upload(path,remote):
    with open(path,'rb') as f: data=f.read()
    return urllib.request.urlopen(urllib.request.Request(BRIDGE+'/'+remote,data=data,method='POST'),timeout=120).status
def enum_value(operator,key,wanted):
    prop=operator.get_rna_type().properties[key]
    values=[i.identifier for i in prop.enum_items_static]
    if wanted in values:return wanted
    # glTF dynamically resolves formats from its implementation, not static RNA.
    if key=='export_format':
        from io_scene_gltf2 import ExportGLTF2
        values=[item[0] for item in ExportGLTF2.export_format_items(None,None)] if hasattr(ExportGLTF2,'export_format_items') else []
        if wanted in values:return wanted
    return None
ACCEPTED=['candidates/grave-marshal-q3-1.glb','candidates/widow-of-the-salvo-q2-0.glb','candidates/ossuary-engine-q2-1.glb','candidates/seraph-of-the-wound-q3-1.glb','originals/the-last-witness.glb']
def process_boss(index, source_path=None):
    source_path=source_path or ACCEPTED[index]
    d=DESIGNS[index];name=d['id'];h=d['height'];w=d['span']
    previous=bpy.context.window.scene
    scene=bpy.data.scenes.get('Boss-'+name) or bpy.data.scenes.new('Boss-'+name)
    bpy.context.window.scene=scene
    for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
    source=os.path.join(WORK,name+'-original.glb')
    urllib.request.urlretrieve(BRIDGE+'/'+(source_path or 'originals/'+name+'.glb'),source)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes=[o for o in scene.objects if o.type=='MESH']
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    lo=Vector([min(v[i] for v in points) for i in range(3)]);hi=Vector([max(v[i] for v in points) for i in range(3)])
    sx=w/(hi.x-lo.x);sz=h/(hi.z-lo.z);sy=min(sx,sz)
    # Bake the imported world transform and normalization into geometry.
    for o in meshes:
        world=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
        for v in o.data.vertices:
            p=world@v.co;v.co=((p.x-(lo.x+hi.x)/2)*sx,(p.y-(lo.y+hi.y)/2)*sy,(p.z-lo.z)*sz)
        if index==0:
            feet=[v.co.z for v in o.data.vertices if abs(v.co.x)<w*.3 and v.co.z<h*.3]
            floor=min(feet) if feet else 0
            for v in o.data.vertices:v.co.z=max(0,(v.co.z-floor)*h/max(.01,h-floor))
        for p in o.data.polygons:p.use_smooth=True
        o.data.update()
        if o.data.has_custom_normals:o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
        o.name=name+'-surface'
        for m in o.data.materials:
            if not m or not m.use_nodes:continue
            n=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            for normal in m.node_tree.nodes:
                if normal.type=='NORMAL_MAP':normal.inputs['Strength'].default_value=.35
            if n:
                # Uniform material response prevents generated metallic maps turning ivory into foil.
                # Base color/normal textures retain local sculptural and material detail.
                for key,value in [('Metallic',.1 if index<3 else .035),('Roughness',.7 if index<3 else .6)]:
                    for link in list(n.inputs[key].links):m.node_tree.links.remove(link)
                    n.inputs[key].default_value=value
    depth=(hi.y-lo.y)*sy
    # Rest coordinates are authored independently for each silhouette.
    bones=[]
    def bone(name,a,b,parent=None):bones.append((name,Vector(a),Vector(b),parent))
    bone('root',(0,0,0),(0,0,h*.12))
    bone('spine',(0,0,h*.38),(0,0,h*.7),'root')
    bone('head',(0,0,h*.7),(0,0,h*.94),'spine')
    for sign,side in [(-1,'L'),(1,'R')]:
        if index==1:
            for j in range(3):
                y=(j-1)*depth*.32
                bone('leg'+side+str(j),(sign*w*.13,y,h*.52),(sign*w*.35,y,h*.32),'root')
                bone('foot'+side+str(j),(sign*w*.35,y,h*.32),(sign*w*.47,y*1.2,.02),'leg'+side+str(j))
            bone('arm'+side,(sign*w*.1,0,h*.65),(sign*w*.17,-depth*.2,h*.88),'spine')
        elif index==0:
            bone('arm'+side,(sign*w*.2,0,h*.76),(sign*w*.29,-depth*.03,h*.61),'spine')
            bone('hand'+side,(sign*w*.29,-depth*.03,h*.61),(sign*w*.33,-depth*.12,h*.48),'arm'+side)
            bone('grip'+side,(sign*w*.33,-depth*.12,h*.48),(sign*w*.35,-depth*.16,h*.42),'hand'+side)
            bone('leg'+side,(sign*w*.12,depth*.05,h*.43),(sign*w*.16,depth*.05,h*.23),'root')
            bone('foot'+side,(sign*w*.16,depth*.05,h*.23),(sign*w*.17,-depth*.15,.03),'leg'+side)
        elif index==2:
            bone('arm'+side,(sign*w*.24,0,h*.75),(sign*w*.36,-depth*.04,h*.52),'spine')
            bone('hand'+side,(sign*w*.36,-depth*.04,h*.52),(sign*w*.46,-depth*.12,h*.30),'arm'+side)
            bone('leg'+side,(sign*w*.12,0,h*.30),(sign*w*.16,depth*.03,h*.16),'root')
            bone('foot'+side,(sign*w*.16,depth*.03,h*.16),(sign*w*.17,-depth*.12,.01),'leg'+side)
        elif index==3:
            bone('arm'+side,(sign*w*.065,0,h*.58),(sign*w*.18,0,h*.79),'spine')
            bone('hand'+side,(sign*w*.18,0,h*.79),(sign*w*.49,0,h*.64),'arm'+side)
            bone('leg'+side,(sign*w*.05,0,h*.4),(sign*w*.1,-depth*.2,h*.18),'root')
            bone('foot'+side,(sign*w*.1,-depth*.2,h*.18),(sign*w*.12,-depth*.3,.01),'leg'+side)
        else:
            bone('arm'+side,(sign*w*.2,0,h*.67),(sign*w*.33,-depth*.1,h*.4),'spine')
            bone('hand'+side,(sign*w*.33,-depth*.1,h*.4),(sign*w*.44,-depth*.25,h*.16),'arm'+side)
            bone('leg'+side,(sign*w*.1,depth*.05,h*.4),(sign*w*.15,depth*.1,h*.2),'root')
            bone('foot'+side,(sign*w*.15,depth*.1,h*.2),(sign*w*.17,-depth*.15,.03),'leg'+side)
        if index==4:
            for j in range(5):
                x=sign*w*(.35+j*.022)
                bone('finger'+side+str(j),(x,-depth*.25,h*.13),(x,-depth*(.4+j*.035),h*.02),'hand'+side)
    if index in (1,2,4):
        for j in range(3):bone('organ'+str(j),((j-1)*w*.1,-depth*.18,h*.56),((j-1)*w*.13,-depth*.22,h*.8),'spine')
    if index==4:
        for sign,side in [(-1,'L'),(1,'R')]:bone('mask'+side,(sign*w*.105,-depth*.28,h*.86),(sign*w*.105,-depth*.38,h*.95),'head')
    if index==3:
        bone('crown',(0,0,h*.78),(0,0,h),'head')
        for sign,side in [(-1,'L'),(1,'R')]:
            bone('talonArm'+side,(sign*w*.065,0,h*.58),(sign*w*.11,-depth*.12,h*.40),'spine')
            bone('talonHand'+side,(sign*w*.11,-depth*.12,h*.40),(sign*w*.16,-depth*.15,h*.28),'talonArm'+side)
            for j in range(3):
                bone('wing'+side+str(j),(sign*w*.18,0,h*.79),(sign*w*(.23+j*.11),0,h*(.43+j*.04)),'hand'+side)

    bpy.ops.object.select_all(action='DESELECT')
    armdata=bpy.data.armatures.new(name+'-rig');rig=bpy.data.objects.new(name+'-rig',armdata);scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for key,a,b,parent in bones:
        eb=armdata.edit_bones.new(key);eb.head=a;eb.tail=b
        if parent:eb.parent=armdata.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    # Normalize four nearest bone influences; rigid outer parts receive sharp weights.
    influences=bones[1:]
    for mesh in meshes:
        verts=np.array([v.co[:] for v in mesh.data.vertices],dtype=float)
        ds=[]
        for key,a,b,parent in influences:
            aa=np.array(a);bb=np.array(b);ab=bb-aa
            t=np.clip(((verts-aa)@ab)/(ab@ab),0,1)
            ds.append(np.sum((verts-aa-t[:,None]*ab)**2,axis=1))
        ds=np.array(ds).T
        blade_vertices=set()
        if index==0:
            parents=list(range(len(verts)))
            def find(i):
                while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
                return i
            def union(a,b):
                a=find(a);b=find(b)
                if a!=b:parents[b]=a
            lower=np.ones(len(verts),dtype=bool) if source_path else verts[:,2]<h*.56
            spatial={}
            for vi,p in enumerate(verts):
                if lower[vi]:
                    key=tuple(np.round(p/(h*.0001)).astype(int))
                    if key in spatial:union(vi,spatial[key])
                    else:spatial[key]=vi
            for edge in mesh.data.edges:
                a,b=edge.vertices
                if lower[a] and lower[b]:union(a,b)
            if source_path:
                ids=np.array([find(vi) for vi in range(len(verts))])
                components=[]
                for part,count in zip(*np.unique(ids,return_counts=True)):
                    if count<500:continue
                    subset=verts[ids==part]
                    if subset[:,0].mean()>w*.23 and np.ptp(subset[:,2])>h*.2:components.append((subset[:,0].mean(),part))
                if components:
                    component=max(components)[1]
                    blade_vertices=set(np.where(ids==component)[0].tolist())
                    blade_array=np.array(sorted(blade_vertices))
                    target=np.array((w*.335,-depth*.14,h*.445))
                    # Bring the door's inner handle into the palm instead of leaving it floating.
                    handle=blade_array[np.argmin(np.sum((verts[blade_array]-target)**2,axis=1))]
                    delta=target-verts[handle]
                    for vi in blade_vertices:
                        mesh.data.vertices[vi].co+=Vector(delta)
                        verts[vi]+=delta
                else:print('No detached blade component; semantic hand assignment will be used')
            else:
                candidates=np.where((verts[:,0]>0)&(verts[:,2]<h*.3))[0]
                seed=int(candidates[np.argmin(verts[candidates,1])])
                component=find(seed)
                blade_vertices={vi for vi in range(len(verts)) if lower[vi] and find(vi)==component}
            print('Separated blade weighting',len(blade_vertices))
        if index in (0,1,2,3,4):
            # Keep blade/hand weights out of boots and knee plates. Pure spatial
            # proximity crosses those nearby surfaces in the generated bind pose.
            for vi,(x,y,z) in enumerate(verts):
                side='L' if x<0 else 'R'
                allowed=None
                if index==1:
                    if z>h*.64:allowed=['spine']+['organ'+str(j) for j in range(3)]
                elif index==3:
                    if z<h*.29 and abs(x)<w*.11:allowed=['leg'+side,'foot'+side]
                    elif (y>depth*.05 and abs(x)>w*.075) or abs(x)>w*.18 or (abs(x)>w*.085 and z>h*.61):allowed=['arm'+side,'hand'+side]+['wing'+side+str(j) for j in range(3)]
                    elif z>h*.77:allowed=['head','crown']
                    elif z<h*.38 and abs(x)<w*.10:allowed=['leg'+side,'foot'+side]
                    elif abs(x)>w*.065 and z<h*.60:allowed=['talonArm'+side,'talonHand'+side]
                    else:allowed=['spine','head']
                elif index==0 and vi in blade_vertices:
                    allowed=['gripR']
                elif index==0 and z<h*.32:
                    allowed=['leg'+side,'foot'+side]
                elif index==2 and ((h*.25<z<h*.44) or (h*.22<z<h*.57 and y<-depth*.12) or (z>h*.34 and abs(x)<w*.32)):
                    allowed=['spine']
                elif z<(h*.30 if index==2 else h*.45) and abs(x)<w*.3:
                    allowed=['leg'+side,'foot'+side]
                elif abs(x)>w*.28 and z<h*.68:
                    allowed=['arm'+side,'hand'+side]
                    if index==0:allowed+=['grip'+side]
                    if index==4 and z<h*.18:allowed+=['finger'+side+str(j) for j in range(5)]
                elif index==0 and x<-w*.18 and z>h*.61:
                    allowed=['armL']
                elif z>h*.8 and abs(x)<w*.18:
                    allowed=['head']
                elif abs(x)<w*.2 and z>h*.42 and z<h*.8:
                    allowed=['spine','head']
                if allowed:
                    for bi,b in enumerate(influences):
                        if b[0] not in allowed:ds[vi,bi]=1e18
        nearest=np.argsort(ds,axis=1)[:,:4]
        weights=1/np.maximum(np.take_along_axis(ds,nearest,axis=1),(.018*h)**2)**3
        weights/=weights.sum(axis=1)[:,None]
        # Diffuse weights over actual surface adjacency, including UV-seam twins.
        # This removes hard anatomical cutoffs that stretch tiny edges into spikes.
        dense=np.zeros((len(verts),len(influences)),dtype=np.float64)
        np.put_along_axis(dense,nearest,weights,axis=1)
        edges=np.array([e.vertices[:] for e in mesh.data.edges],dtype=np.int32)
        twins={};seams=[]
        for vi,p in enumerate(verts):
            key=tuple(np.round(p/(h*.00005)).astype(int))
            if key in twins:seams.append((vi,twins[key]))
            else:twins[key]=vi
        if seams:edges=np.concatenate([edges,np.array(seams,dtype=np.int32)])
        a,b=edges.T;counts=np.bincount(np.concatenate([a,b]),minlength=len(verts))[:,None]
        for iteration in range(18):
            sums=np.zeros_like(dense);np.add.at(sums,a,dense[b]);np.add.at(sums,b,dense[a])
            dense=.25*dense+.75*sums/np.maximum(1,counts)
        nearest=np.argsort(dense,axis=1)[:,-4:]
        weights=np.take_along_axis(dense,nearest,axis=1);weights/=weights.sum(axis=1)[:,None]
        groups=[mesh.vertex_groups.new(name=b[0]) for b in influences]
        for vi in range(len(verts)):
            for k in range(4):
                if weights[vi,k]>.0001:groups[int(nearest[vi,k])].add([vi],float(weights[vi,k]),'REPLACE')
        mesh.parent=rig;mod=mesh.modifiers.new('Creature deformation','ARMATURE');mod.object=rig
    if index==4:
        # Three rigid ceramic masks replace the generated camera-like face.
        maskpath=os.path.join(WORK,'witness-funeral-mask.glb')
        urllib.request.urlretrieve(BRIDGE+'/candidates/the-last-witness-q5-0.glb',maskpath)
        before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=maskpath)
        imported=[o for o in scene.objects if o not in before and o.type=='MESH']
        pts=[o.matrix_world@Vector(c) for o in imported for c in o.bound_box]
        low=Vector([min(p[i] for p in pts) for i in range(3)]);high=Vector([max(p[i] for p in pts) for i in range(3)])
        scale=h*.28/(high.z-low.z)
        headfront=min(v.co.y for o in meshes for v in o.data.vertices if v.co.z>h*.79)
        for source in imported:
            world=source.matrix_world.copy()
            coords=[world@v.co for v in source.data.vertices]
            for side,bonekey in [(0,'head'),(-1,'maskL'),(1,'maskR')]:
                obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj)
                obj.parent=None;obj.matrix_world.identity();obj.name=name+'-funeral-mask-'+bonekey
                angle=side*.30
                center=Vector((side*w*.105,headfront-h*.06,h*(.872 if side==0 else .849)))
                for v,co in zip(obj.data.vertices,coords):
                    q=(co-(low+high)*.5)*scale
                    # Turn the side faces outward without distorting their sculpt.
                    v.co=Vector((q.x*math.cos(angle)-q.y*math.sin(angle),q.x*math.sin(angle)+q.y*math.cos(angle),q.z))+center
                for mat in obj.data.materials:
                    if mat and mat.use_nodes:
                        node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                        for key,value in [('Metallic',.035),('Roughness',.65)]:
                            for link in list(node.inputs[key].links):mat.node_tree.links.remove(link)
                            node.inputs[key].default_value=value
                for face in obj.data.polygons:face.use_smooth=True
                group=obj.vertex_groups.new(name=bonekey);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
                # Twin articulated bronze supports visibly attach each mask to the skull.
                supportmat=bpy.data.materials.get(name+'-mask-bronze')
                if not supportmat:
                    supportmat=bpy.data.materials.new(name+'-mask-bronze');supportmat.use_nodes=True
                    node=next(n for n in supportmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                    node.inputs['Base Color'].default_value=(.10,.065,.032,1);node.inputs['Metallic'].default_value=.65;node.inputs['Roughness'].default_value=.5
                vertices=[];faces=[]
                for dz in [-h*.068,h*.068]:
                    points=[center+Vector((0,h*.005,dz)),Vector((center.x,-depth*.29,center.z+dz)),Vector((center.x,-depth*.20,center.z+dz*.8))]
                    base=len(vertices)
                    for point in points:
                        for j in range(12):
                            a=math.tau*j/12;vertices.append(point+Vector((math.cos(a)*h*.004,0,math.sin(a)*h*.004)))
                    for k in range(2):
                        for j in range(12):faces.append((base+k*12+j,base+k*12+(j+1)%12,base+(k+1)*12+(j+1)%12,base+(k+1)*12+j))
                data=bpy.data.meshes.new('mask-support');data.from_pydata(vertices,[],faces);data.materials.append(supportmat)
                support=bpy.data.objects.new('mask-support',data);scene.collection.objects.link(support)
                vg=support.vertex_groups.new(name=bonekey);vg.add(list(range(len(vertices))),1,'REPLACE')
                bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);support.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
                obj.parent=rig;obj.modifiers.new('Rigid mask articulation','ARMATURE').object=rig;meshes.append(obj)
            bpy.data.objects.remove(source,do_unlink=True)
    # Additional emissive core and iris pieces, attached to the actual skeleton.
    def material(label,color,metal=0,rough=.5,emission=0):
        m=bpy.data.materials.new(name+'-'+label);m.use_nodes=True
        p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
        if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
        return m
    # A recessed mouth-like aperture replaces the flat glowing placeholder sphere.
    tissue=material('throat-tissue',(.105,.018,.026),.02,.68)
    darkness=material('throat-void',(.003,.002,.004),0,.92)
    ivory=material('throat-cartilage',(.37,.29,.21),.02,.74)
    coal=material('throat-embers',(.32,.035,.009),0,.58,.3)
    front=[v.co.y for o in meshes for v in o.data.vertices if abs(v.co.x)<w*.07 and h*.50<v.co.z<h*.61]
    mouth_y=(min(front) if front else -depth*.3)-h*.006
    center=(0,mouth_y,h*.56)
    def attach(o,mat):
        o.name='living-core-'+mat.name
        o.data.materials.append(mat)
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        vg=o.vertex_groups.new(name='spine');vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
        o.parent=rig;o.modifiers.new('Core attachment','ARMATURE').object=rig
        for poly in o.data.polygons:poly.use_smooth=True
        meshes.append(o)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=center)
    void=bpy.context.object;void.scale=(w*.032,h*.006,h*.045);attach(void,darkness)
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=10,major_radius=1,minor_radius=.13,location=(0,mouth_y-h*.008,h*.56),rotation=(math.pi/2,0,0))
    lip=bpy.context.object;lip.scale=(w*.035,h*.049,h*.035);attach(lip,tissue)
    for j in range(12):
        angle=math.tau*j/12
        x=math.cos(angle)*w*.027;z=h*.56+math.sin(angle)*h*.035
        bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=h*.006,radius2=h*.001,depth=h*.019,location=(x,mouth_y-h*.014,z))
        tooth=bpy.context.object;tooth.rotation_euler=Vector((-x,0,h*.56-z)).to_track_quat('Z','Y').to_euler();attach(tooth,ivory)
    for sign in [-1,1]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=(sign*w*.009,mouth_y-h*.008,h*.56))
        eye=bpy.context.object;eye.scale=(w*.002,h*.003,h*.003);attach(eye,coal)
    core=[o for o in meshes if o.name.startswith('living-core')]
    bpy.ops.object.select_all(action='DESELECT')
    for o in core:o.select_set(True)
    bpy.context.view_layer.objects.active=core[0];bpy.ops.object.join()
    meshes=[o for o in scene.objects if o.type=='MESH']
    # NLA strips retain all clips in the editable source and exported GLB.
    scene.render.fps=30
    metadata={}
    def reset():
        for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
    def translate(key,x=0,y=0,z=0):
        rig.pose.bones[key].location=armdata.bones[key].matrix_local.to_3x3().inverted()@Vector((x,y,z))
    def curve(t,points):
        if t<=points[0][0]:return points[0][1]
        for (a,v),(b,wv) in zip(points,points[1:]):
            if t<=b:
                k=(t-a)/(b-a);k=k*k*(3-2*k)
                return v+(wv-v)*k
        return points[-1][1]
    def rot(key,x=0,y=0,z=0):
        if key in rig.pose.bones:rig.pose.bones[key].rotation_euler=(x,y,z)
    for clip in ['idle','entrance','transform','stagger',*CLIPS[index],'death']:
        rig.animation_data_create();rig.animation_data.action=None
        duration=120 if clip=='idle' else 180 if clip=='death' else 60 if clip in ('entrance','transform') else 72
        frames=range(0,duration+1,3)
        for frame in frames:
            reset();t=frame/30;u=frame/duration
            breath=math.sin(u*math.tau)*.022
            rot('spine',breath,0,math.sin(u*math.tau)*.012)
            rot('head',-breath,math.sin(u*math.tau)*.035,0)
            if clip=='idle':
                if index==3:
                    for side,sgn in [('L',-1),('R',1)]:rot('arm'+side,math.sin(u*math.tau)*.09,0,sgn*.04);rot('hand'+side,math.sin(u*math.tau-.5)*.12)
                    rot('crown',math.sin(u*math.tau+.8)*.08)
                if index==4:
                    rot('maskL',0,math.sin(u*math.tau)*.06);rot('maskR',0,math.sin(u*math.tau+1)*.06)
                if index==1:
                    for j in range(3):rot('organ'+str(j),math.sin(u*math.tau-j*.7)*.035)
            elif clip=='entrance':
                ease=(1-u)**3
                rot('spine',-.22*ease);translate('root',z=-h*.025*ease)
            elif clip=='transform':
                a=math.sin(u*math.pi/2)
                rot('spine',-.16*a)
                for side,sgn in [('L',-1),('R',1)]:rot('arm'+side,-.12*a,0,sgn*.2*a)
                for j in range(3):rot('organ'+str(j),-.14*a,0,(j-1)*.2*a)
                rot('head',-.2*a,0,0)
                if index==4:
                    rot('maskL',0,-.45*a,0);rot('maskR',0,.45*a,0)
            elif clip=='stagger':
                a=math.sin(min(1,u*2)*math.pi)*(1-u)
                rot('spine',-.18*a,0,.08*a);rot('head',.24*a)
            elif clip=='death':
                a=u*u*(3-2*u);rot('spine',.8*a,0,.2*a);rot('head',.35*a,0,-.25*a)
                translate('root',z=-h*.36*a)
                for side,sgn in [('L',-1),('R',1)]:rot('arm'+side,.6*a,0,sgn*.35*a);rot('hand'+side,.3*a)
            else:
                # 1.2 seconds is the authored release/contact event in every attack.
                wind=min(1,t/1.05);impact=max(0,min(1,(t-1.05)/.15));recover=max(0,min(1,(t-1.35)/1.05))
                strength=(1-recover)
                swing=(-.36*wind+.68*impact)*strength
                if clip in ('cleave','surgery'):
                    rot('spine',.04,(-.32*wind+.64*impact)*strength,.08*strength)
                    rot('armR',(-.25*wind+.5*impact)*strength,(-.5*wind+.9*impact)*strength,-.25*strength);rot('handR',(-.15*wind+.3*impact)*strength)
                elif clip in ('execution','palm','talon','heel'):
                    rot('spine',swing)
                    for side in ['L','R']:rot('arm'+side,(-1.0*wind+1.35*impact)*strength);rot('hand'+side,(-.25*wind+.5*impact)*strength)
                else:
                    rot('spine',(-.1*wind+.22*impact)*strength)
                    rot('head',(-.16*wind+.35*impact)*strength)
                    for j in range(3):rot('organ'+str(j),(-.15*wind+.28*impact)*strength,0,(j-1)*.04*wind)
                    for side,sgn in [('L',-1),('R',1)]:rot('arm'+side,-.25*wind*strength,0,sgn*.18*wind*strength);rot('hand'+side,.12*impact*strength)
                # Species-specific secondary motion makes the attack readable in silhouette.
                if clip=='heel':
                    rot('legR',(-.32*wind+.18*impact)*strength);rot('footR',(.2*wind-.3*impact)*strength)
                    rot('armL',-.12*wind*strength);rot('armR',.1*wind*strength)
                elif clip in ('mortar','needles','shell'):
                    for side,sgn in [('L',-1),('R',1)]:
                        for j in range(3):rot('leg'+side+str(j),.045*wind*strength,0,sgn*.05*wind*strength)
                    for j in range(3):
                        recoil=math.exp(-((t-(1.2+j*(.09 if clip=='needles' else 0)))/.1)**2)
                        rot('organ'+str(j),(-(.25 if clip=='mortar' else .12)*wind+.22*recoil)*strength,0,(j-1)*(.14 if clip=='shell' else .025)*wind*strength)
                elif clip=='restraint':
                    for side,sgn in [('L',-1),('R',1)]:
                        rot('arm'+side,-.2*wind*strength,0,sgn*(.34*wind-.28*impact)*strength)
                        rot('hand'+side,.18*wind*strength,sgn*.12*impact*strength)
                elif clip=='rivets':
                    for j in range(3):rot('organ'+str(j),(-.12*wind+.3*math.exp(-((t-1.2-j*.07)/.08)**2))*strength)
                elif clip=='spears':
                    for side,sgn in [('L',-1),('R',1)]:
                        rot('arm'+side,-.22*wind*strength,0,sgn*.14*wind*strength)
                        rot('hand'+side,(.32*wind-.5*impact)*strength)
                elif clip=='beam':
                    rot('head',-.22*wind*strength,.2*math.sin(max(0,t-1.2)*math.pi)*strength)
                    rot('crown',-.3*wind*strength)
                elif clip=='eyes':
                    rot('maskL',0,-.35*wind*strength);rot('maskR',0,.35*wind*strength)
                    rot('head',-.12*wind*strength,.08*math.sin(t*3)*strength)
                elif clip=='ribs':
                    for j in range(3):rot('organ'+str(j),-.22*wind*strength,0,(j-1)*.3*wind*strength)
                if index==3 and clip!='beam':rot('crown',-.2*wind*strength)
                if index==4:
                    for side in ['L','R']:
                        for j in range(5):rot('finger'+side+str(j),(.18*wind-.28*impact)*strength)
            if clip in CLIPS[index]:
                anticipate=curve(t,[(0,0),(.82,1),(1.05,1),(1.2,0),(2.4,0)])
                strike=curve(t,[(0,0),(1.05,0),(1.2,1),(1.38,1.08),(2.4,0)])
                echo=math.sin(max(0,t-1.2)*13)*math.exp(-max(0,t-1.2)*5) if t>1.2 else 0
                if index==0:
                    if clip=='cleave':
                        rot('spine',.05*strike,-.26*anticipate+.28*strike,.04*anticipate)
                        rot('armR',-.55*anticipate+.35*strike,-.6*anticipate+.6*strike,-.38*anticipate+.22*strike)
                        rot('handR',-.36*anticipate+.32*strike,.08*echo)
                        rot('gripR',.09*echo,0,-.06*echo)
                        rot('armL',.08*anticipate-.1*strike,0,.05*strike)
                    elif clip=='execution':
                        rot('armR',-1.25*anticipate+.48*strike,0,-.16*anticipate)
                        rot('handR',-.45*anticipate+.25*strike);rot('spine',-.12*anticipate+.28*strike)
                        rot('armL',-.12*anticipate+.1*strike)
                    else:
                        rot('legR',-.32*anticipate+.08*strike);rot('footR',.25*anticipate-.12*strike)
                        rot('armR',-.12*anticipate+.12*strike);rot('handR',.05*echo)
                elif index==1:
                    # Body rears from the pelvis while the independently rooted feet stay planted.
                    rot('spine',-.18*anticipate+.12*strike+.015*echo)
                    for j in range(3):
                        recoil=math.exp(-((t-(1.2+j*(.075 if clip=='needles' else 0)))/.085)**2)
                        rot('organ'+str(j),-.19*anticipate+.22*recoil,0,(j-1)*.04*anticipate)
                elif index==2:
                    rot('spine',-.035*anticipate+.045*strike,-.08*anticipate+.11*strike)
                    if clip=='surgery':
                        rot('armR',-.62*anticipate+.34*strike,-.18*anticipate+.28*strike)
                        rot('handR',-.4*anticipate+.46*strike+.05*echo)
                        rot('armL',-.16*anticipate+.08*strike)
                    elif clip=='restraint':
                        for side,sgn in [('L',-1),('R',1)]:
                            rot('arm'+side,-.28*anticipate+.2*strike,0,sgn*(.3*anticipate-.2*strike))
                            rot('hand'+side,-.3*anticipate+.33*strike)
                elif index==3:
                    for side,sgn in [('L',-1),('R',1)]:
                        rot('arm'+side,-.16*anticipate+.14*strike,0,sgn*(.07*anticipate-.05*strike))
                        rot('hand'+side,.27*anticipate-.2*strike+.025*echo)
                    rot('crown',-.13*anticipate+.12*strike+.02*echo)
                    for side,sgn in [('L',-1),('R',1)]:
                        rot('talonArm'+side,(-.5*anticipate+.3*strike) if clip=='talon' else .06*anticipate)
                        rot('talonHand'+side,(-.35*anticipate+.25*strike) if clip=='talon' else .05*echo)
                        for j in range(3):rot('wing'+side+str(j),(.12*anticipate-.09*strike+.018*echo)*(j+1)/3)

                elif index==4:
                    if clip=='palm':
                        rot('spine',-.08*anticipate+.13*strike)
                        rot('armR',-.46*anticipate+.13*strike,0,-.06*anticipate)
                        rot('handR',-.22*anticipate+.12*strike+.025*echo)
                        rot('armL',-.10*anticipate+.04*strike)
                    for side in ['L','R']:
                        for j in range(5):
                            lag=curve(t,[(0,0),(.82+j*.025,1),(1.05+j*.02,1),(1.26+j*.015,0),(2.4,0)])
                            rot('finger'+side+str(j),.13*lag-.05*strike)
            if clip=='death' and index==1:
                rot('spine',.32*a,0,.08*a);rot('head',0)
                for j in range(3):rot('organ'+str(j),.025*a)
            if clip=='death' and index==2:
                # The bed and rib frame topple as one heavy assembly.
                rot('root',.68*a,0,.12*a);rot('spine',.06*a);rot('head',.10*a)
                for side in ['L','R']:rot('arm'+side,.12*a);rot('hand'+side,.08*a)
            for p in rig.pose.bones:
                p.keyframe_insert(data_path='rotation_euler',frame=frame,group=p.name);p.keyframe_insert(data_path='location',frame=frame,group=p.name)
        action=rig.animation_data.action;action.name=name+':'+clip;action.use_fake_user=True
        track=rig.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,0,action);track.mute=True
        metadata[clip]={'duration':duration/30,'release':1.2 if clip in CLIPS[index] else None}
    rig.animation_data.action=None;reset();scene.frame_set(0)
    scene.frame_start=0;scene.frame_end=180
    for o in scene.objects:o.select_set(o.type in ('MESH','ARMATURE'))
    bpy.context.view_layer.objects.active=rig
    output=os.path.join(WORK,name+'.glb')
    import io_scene_gltf2
    formats=io_scene_gltf2.get_format_items(None,bpy.context)
    fmt=next(v[0] for v in formats if 'binary' in (v[1]+v[2]).lower())
    mode=enum_value(bpy.ops.export_scene.gltf,'export_animation_mode','ACTIONS')
    kwargs=dict(export_format=fmt,use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode=mode,export_nla_strips=True,export_anim_single_armature=False,export_force_sampling=True,export_frame_range=False,export_yup=True)
    bpy.ops.export_scene.gltf(filepath=output,**kwargs);upload(output,'processed/'+name+'.glb')
    blend=os.path.join(WORK,name+'.blend');bpy.data.libraries.write(blend,{scene},fake_user=True,compress=True);upload(blend,'source/'+name+'.blend')
    for o in meshes:o.data.calc_loop_triangles()
    hightris=sum(len(o.data.loop_triangles) for o in meshes)
    high_meshes={o:o.data.copy() for o in meshes}
    dense_total=sum(len(o.data.polygons) for o in meshes if len(o.data.polygons)>5000)
    for o in meshes:
        if len(o.data.polygons)>5000:
            dec=o.modifiers.new('Performance topology','DECIMATE');dec.ratio=min(1,38000/max(1,dense_total))
            bpy.context.view_layer.objects.active=o
            bpy.ops.object.modifier_move_up(modifier=dec.name)
            bpy.ops.object.modifier_apply(modifier=dec.name)
            for face in o.data.polygons:face.use_smooth=True
            if o.data.has_custom_normals:o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
            o.data.update()
    for image in bpy.data.images:
        if image.size[0]>2048 and image.users>0:
            # Only images referenced by this task's materials.
            used=any(n.type=='TEX_IMAGE' and n.image==image for o in meshes for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes)
            if used:image.scale(2048,2048)
    low=os.path.join(WORK,name+'-lod.glb');bpy.ops.export_scene.gltf(filepath=low,**kwargs);upload(low,'processed/'+name+'-lod.glb')
    for o in meshes:o.data.calc_loop_triangles()
    report={'id':name,'blender':bpy.app.version_string,'height':h,'span':w,'bones':len(bones),'trianglesHigh':hightris,'trianglesPerformance':sum(len(o.data.loop_triangles) for o in meshes),'clips':metadata,'qualityPass':'q2','source':source_path,'additionalSources':['candidates/the-last-witness-q5-0.glb'] if index==4 else []}
    reportfile=os.path.join(WORK,name+'.json');open(reportfile,'w').write(json.dumps(report,indent=2));upload(reportfile,'processed/'+name+'.json')
    for o,high_mesh in high_meshes.items():
        low_mesh=o.data;o.data=high_mesh
        if low_mesh.users==0:bpy.data.meshes.remove(low_mesh)
    bpy.context.window.scene=previous
    return report

def render_boss(index,view='front',clip=None,frame=0):
    d=DESIGNS[index];name=d['id'];h=d['height'];w=d['span']
    old=bpy.context.window.scene;scene=bpy.data.scenes['Boss-'+name];bpy.context.window.scene=scene
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    if clip:
        action=next(track.strips[0].action for track in rig.animation_data.nla_tracks if track.name==clip)
        rig.animation_data.action=action
        if action.slots:rig.animation_data.action_slot=action.slots[0]
    else:
        rig.animation_data.action=None
        for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
    scene.frame_set(frame)
    for o in scene.objects:
        if o.type=='MESH' and o.name.startswith('living-core'):o.hide_render=clip!='transform'
    target=Vector((0,0,h*.48));extent=max(h,w*.75)
    camera=bpy.data.objects.get(name+'-review-camera')
    if not camera:
        data=bpy.data.cameras.new(name+'-review-camera');camera=bpy.data.objects.new(name+'-review-camera',data);scene.collection.objects.link(camera)
    angle={'front':0,'side':math.pi/2,'rear':math.pi}.get(view,0)
    camera.location=(math.sin(angle)*extent*1.85,-math.cos(angle)*extent*1.85,h*.58)
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=38;camera.data.clip_end=1000;scene.camera=camera
    for idx,(loc,energy,size) in enumerate([((extent,-extent,extent*1.8),extent*extent*18,extent),((-extent,-extent*.4,extent),extent*extent*10,extent),((0,extent,extent*1.4),extent*extent*22,extent*.7)]):
        label=name+'-review-light'+str(idx);light=bpy.data.objects.get(label)
        if not light:
            light=bpy.data.objects.new(label,bpy.data.lights.new(label,'AREA'));scene.collection.objects.link(light)
        light.location=loc;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    scene.world=bpy.data.worlds.new(name+'-review-world');scene.world.use_nodes=True
    background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');background.inputs['Color'].default_value=(.06,.075,.09,1);background.inputs['Strength'].default_value=.4
    scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format=next(i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items if i.identifier.lower()=='png')
    path=os.path.join(WORK,name+'-'+view+(('-'+clip) if clip else '')+'.png');scene.render.filepath=path
    bpy.ops.render.render(write_still=True);upload(path,'review/'+os.path.basename(path));rig.animation_data.action=None;bpy.context.window.scene=old
    return os.path.basename(path)


def film_boss(index):
    """A 10 fps contact-motion review, using the live High rig."""
    name=DESIGNS[index]['id'];clip=CLIPS[index][0]
    for frame in range(0,73,3):
        filename=render_boss(index,clip=clip,frame=frame)
        upload(os.path.join(WORK,filename),'review/film-'+name+'-'+str(frame//3).zfill(3)+'.png')
    return name
