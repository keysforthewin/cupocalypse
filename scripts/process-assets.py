import bpy, sys, os, math, json
import numpy as np
np.bool = np.bool_
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source=args[0];dest=args[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Preserve imported armatures and animation. Normalize in a parent export root.
coords=[o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
height=max(.001,hi.z-lo.z)
root=bpy.data.objects.new('RuntimeRoot',None);bpy.context.collection.objects.link(root)
for obj in list(bpy.context.scene.objects):
 if obj!=root and obj.parent is None: obj.parent=root
root.scale=(1.8/height,)*3
root.location=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))*(1.8/height)
for obj in meshes:
 if len(obj.data.polygons)>7000:
  mod=obj.modifiers.new('RuntimeLOD','DECIMATE');mod.ratio=6000/len(obj.data.polygons)
  bpy.context.view_layer.objects.active=obj
  try:bpy.ops.object.modifier_apply(modifier=mod.name)
  except:pass
 for poly in obj.data.polygons:poly.use_smooth=True
for img in bpy.data.images:
 if img.size[0]>1024:img.scale(1024,1024)
os.makedirs(os.path.dirname(dest),exist_ok=True)
if len(args)>2:
 sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
 from rig import rig_meshes
 bpy.context.view_layer.update()
 meshes=rig_meshes(meshes,args[2])
bpy.ops.export_scene.gltf(filepath=dest,export_format='GLB',export_animations=True)
# Neutral comparison render, same camera, lights, and backdrop for both candidates.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));floor=bpy.context.object
mat=bpy.data.materials.new('Backdrop');mat.diffuse_color=(.14,.18,.17,1);floor.data.materials.append(mat)
bpy.ops.object.camera_add(location=(3,-5,2.7));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.9))-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=camera;camera.data.lens=62
for location,energy,size in [((2,-4,6),650,4),((-3,-1,3),400,3),((0,4,4),700,3)]:
 bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=False;scene.eevee.use_gtao=True;scene.eevee.gtao_distance=3;scene.render.resolution_x=420;scene.render.resolution_y=540;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=dest.replace('.glb','-review.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'source':source,'output':dest,'meshes':len(meshes),'triangles':sum(len(o.data.polygons) for o in meshes),'height':height}))
