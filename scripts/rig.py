# Shared humanoid rig and authored nonhumanoid appendage rigs for normalized meshes.
import bpy, math
from mathutils import Vector

def rig_meshes(meshes,kind):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in meshes:obj.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0]
 bpy.ops.object.join();mesh=bpy.context.object
 # Bake normalization root and import transforms into mesh coordinates.
 world=mesh.matrix_world.copy()
 for v in mesh.data.vertices:v.co=world @ v.co
 mesh.parent=None;mesh.matrix_world.identity()
 bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.object;rig.name=kind+'-shared-rig';bones=rig.data.edit_bones
 bones.remove(bones[0]);spec=[]
 def bone(name,head,tail,parent=None):
  b=bones.new(name);b.head=head;b.tail=tail
  if parent:b.parent=bones[parent]
  spec.append((name,Vector(head),Vector(tail)))
 low=kind in ['crawler','broodmass']
 bone('pelvis',(0,0,.3 if low else .72),(0,0,.6 if low else 1.04))
 bone('spine',(0,0,.6 if low else 1.04),(0,-.2 if low else 0,.95 if low else 1.43),'pelvis')
 bone('head',(0,-.2 if low else 0,.95 if low else 1.43),(0,-.3 if low else 0,1.25 if low else 1.8),'spine')
 for side in [-1,1]:
  tag='L' if side<0 else 'R'
  if low:
   bone('arm'+tag,(side*.3,-.2,.7),(side*.6,-.45,.35),'spine');bone('hand'+tag,(side*.6,-.45,.35),(side*.7,-.65,.03),'arm'+tag)
   bone('leg'+tag,(side*.2,.2,.6),(side*.45,.5,.3),'pelvis');bone('foot'+tag,(side*.45,.5,.3),(side*.5,.65,.04),'leg'+tag)
  else:
   bone('arm'+tag,(side*.25,0,1.4),(side*.4,0,1.12),'spine');bone('hand'+tag,(side*.4,0,1.12),(side*.45,-.07,.85),'arm'+tag)
   bone('leg'+tag,(side*.15,0,.82),(side*.15,0,.43),'pelvis');bone('foot'+tag,(side*.15,0,.43),(side*.15,-.05,.08),'leg'+tag)
 if kind=='congregation':
  for i in range(4):bone('aux-head'+str(i),((i-1.5)*.18,0,1.35),((i-1.5)*.18,0,1.65),'spine')
 if kind=='broodmass':
  for i in range(4):bone('sac'+str(i),((i-1.5)*.2,.2,.6),((i-1.5)*.2,.2,1),'spine')
 bpy.ops.object.mode_set(mode='OBJECT')
 groups={name:mesh.vertex_groups.new(name=name) for name,a,b in spec}
 for v in mesh.data.vertices:
  distances=[]
  for name,a,b in spec:
   delta=b-a;t=max(0,min(1,(v.co-a).dot(delta)/delta.length_squared));distance=(v.co-(a+t*delta)).length
   distances.append((distance,name))
  nearest=sorted(distances)[:3];weights=[1/(.015+d*d)**3 for d,n in nearest];total=sum(weights)
  for (d,name),weight in zip(nearest,weights):groups[name].add([v.index],weight/total,'REPLACE')
 mod=mesh.modifiers.new('Shared anatomy deformation','ARMATURE');mod.object=rig;mesh.parent=rig
 rig.animation_data_create();action=bpy.data.actions.new(kind+'-locomotion');rig.animation_data.action=action
 for frame in range(0,61,10):
  phase=frame/60*math.pi*2
  for pb in rig.pose.bones:
   pb.rotation_mode='XYZ';amp=.12 if kind in ['broodmass','congregation'] else .24
   if pb.name.startswith(('leg','foot')):pb.rotation_euler.x=math.sin(phase+(math.pi if pb.name.endswith('L') else 0))*amp
   elif pb.name.startswith(('arm','hand')):pb.rotation_euler.x=math.sin(phase+(math.pi if pb.name.endswith('R') else 0))*amp*.7
   elif pb.name.startswith(('aux','sac')):pb.rotation_euler.y=math.sin(phase+len(pb.name))*.09
   elif pb.name=='spine':pb.rotation_euler.y=math.sin(phase)*.025
   pb.keyframe_insert(data_path='rotation_euler',frame=frame)
 scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=60;scene.render.fps=30;scene.frame_set(0)
 return [mesh]
