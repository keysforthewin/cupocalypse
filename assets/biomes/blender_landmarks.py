"""Reproducible Blender-authored lookout and damaged transmission tower."""
import bpy, math, os, json, tempfile, urllib.request
from mathutils import Vector
BRIDGE='http://192.168.8.111:9877'
work=os.path.join(tempfile.gettempdir(),'march-biomes');os.makedirs(work,exist_ok=True)
def material(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=.73;n.inputs['Metallic'].default_value=metal
 return m
def cube(name,p,s,mat,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Edge highlights','BEVEL');m.width=bevel;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
def beam(name,a,b,width,mat):
 a,b=Vector(a),Vector(b);o=cube(name,(a+b)/2,(width,width,(b-a).length),mat,.015);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def make_landmark(name):
 old=bpy.context.window.scene;scene=bpy.data.scenes.get('Biome-'+name) or bpy.data.scenes.new('Biome-'+name);bpy.context.window.scene=scene
 for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
 timber=material(name+' cedar',(.24,.18,.11));metal=material(name+' oxidized steel',(.19,.25,.23),.55);trim=material(name+' trim',(.43,.4,.28));glass=material(name+' glass',(.1,.22,.24),.3)
 if name=='forest-lookout':
  for x in [-1.25,1.25]:
   for y in [-1.25,1.25]:
    beam('Tapered support',(x*1.5,y*1.5,0),(x,y,8),.23,timber)
    for z in [1.5,4,6.5]:
     beam('Cross bracing',(x*1.45,y*1.45,z),(x*-1.15,y*1.15,z+2),.105,trim)
  for y in [i*.22-1.8 for i in range(17)]:cube('Deck plank',(0,y,8),(3.8,.2,.13),timber)
  for x in [-1.8,1.8]:
   for y in [-1.8,1.8]:cube('Rail post',(x,y,8.65),(.1,.1,1.3),trim)
   cube('Deck railing',(x,0,9.15),(.1,3.6,.12),trim)
  for y in [-1.8,1.8]:cube('Deck railing',(0,y,9.15),(3.6,.1,.12),trim)
  cube('Cabin',(0,0,9.25),(2.65,2.65,2.4),timber)
  for side in [-1,1]:
   for offset in [-.7,0,.7]:
    cube('Window',(side*1.335,offset,9.6),(.035,.57,1.15),glass,0)
    cube('Frame',(side*1.37,offset,9.02),(.08,.67,.06),trim)
    cube('Window',(offset,side*1.335,9.6),(.57,.035,1.15),glass,0)
   roof=cube('Pitched steel roof',(side*.78,0,10.85),(1.85,3.4,.1),metal);roof.rotation_euler.y=side*.43
  for x in [-.5,.5]:beam('Ladder stile',(x,-2.2,0),(x,-1.8,8),.08,metal)
  for i in range(26):cube('Ladder rung',(0,-2.2+i*.4/26,i*.3), (1.05,.07,.07),metal,.01)
 else:
  for x in [-1.6,1.6]:
   for y in [-1.6,1.6]:
    beam('Pylon leg',(x,y,0),(x*.35+.6,y*.35,10),.15,metal)
    for z in range(0,9,2):
     f=1-z*.055;g=1-(z+2)*.055
     beam('Diagonal lattice',(x*f+z*.06,y*f,z),(-x*g+(z+2)*.06,y*g,z+2),.06,metal)
  for z,width in [(7.5,6.7),(9.5,5)]:
   beam('Bent crossarm',(-width/2+.5,0,z),(width/2+.7,.2,z+.25),.14,metal)
   for x in [-width/2+.5,width/2+.7]:
    for i in range(6):cube('Ceramic insulator',(x,0,z-.18-i*.12),(.27,.27,.06),trim,.03)
 bpy.context.view_layer.update();meshes=[o for o in scene.objects if o.type=='MESH'];pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
 low=[min(v[i] for v in pts) for i in range(3)];high=[max(v[i] for v in pts) for i in range(3)]
 for o in meshes:o.location.z-=low[2]
 bpy.ops.object.select_all(action='SELECT');dest=os.path.join(work,name+'.glb');bpy.ops.export_scene.gltf(filepath=dest,export_format='GLB',use_active_scene=True,use_selection=True)
 for remote,data in [('processed/'+name+'.glb',open(dest,'rb').read()),('processed/'+name+'.json',json.dumps({'id':name,'width':high[0]-low[0],'depth':high[1]-low[1],'height':high[2]-low[2],'source':'Blender procedural authoring','blender':bpy.app.version_string}).encode())]:
  urllib.request.urlopen(urllib.request.Request(BRIDGE+'/'+remote,data=data,method='POST'),timeout=120).read()
 blend=os.path.join(work,name+'.blend');bpy.data.libraries.write(blend,{scene},fake_user=True,compress=True);urllib.request.urlopen(urllib.request.Request(BRIDGE+'/source/'+name+'.blend',data=open(blend,'rb').read(),method='POST'),timeout=120).read()
 bpy.context.window.scene=old
 return name
