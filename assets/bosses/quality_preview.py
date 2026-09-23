import bpy, math, os, urllib.request, tempfile
from mathutils import Vector
BRIDGE='http://192.168.8.111:9878'
WORK=os.path.join(tempfile.gettempdir(),'march-boss-quality');os.makedirs(WORK,exist_ok=True)
def preview(file,label,height=10,view='front'):
    previous=bpy.context.window.scene
    scene=bpy.data.scenes.get('Candidate-'+label) or bpy.data.scenes.new('Candidate-'+label)
    bpy.context.window.scene=scene
    for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
    path=os.path.join(WORK,label+'.glb');urllib.request.urlretrieve(BRIDGE+'/'+file,path)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes=[o for o in scene.objects if o.type=='MESH'];bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
    scale=height/(hi.z-lo.z)
    for o in meshes:
        matrix=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
        for v in o.data.vertices:
            p=matrix@v.co;v.co=((p.x-(lo.x+hi.x)/2)*scale,(p.y-(lo.y+hi.y)/2)*scale,(p.z-lo.z)*scale)
        for f in o.data.polygons:f.use_smooth=True
        if o.data.has_custom_normals:o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
        for m in o.data.materials:
            if not m or not m.use_nodes:continue
            n=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if n:
                # Use a neutral matte preview to judge sculpt and albedo coherently.
                for key,val in [('Metallic',.08),('Roughness',.68)]:
                    for link in list(n.inputs[key].links):m.node_tree.links.remove(link)
                    n.inputs[key].default_value=val
            for n in m.node_tree.nodes:
                if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.4
    width=(hi.x-lo.x)*scale;extent=max(height,width*.78)
    camera=bpy.data.objects.new(label+'-camera',bpy.data.cameras.new(label+'-camera'));scene.collection.objects.link(camera)
    angle={'front':0,'side':math.pi/2,'rear':math.pi}[view];target=Vector((0,0,height*.48));camera.location=(math.sin(angle)*extent*2.1,-math.cos(angle)*extent*2.1,height*.6);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=48;camera.data.clip_end=1000;scene.camera=camera
    for i,(loc,power) in enumerate([((-extent,-extent,extent*1.5),18),((extent,-extent*.5,extent),7),((0,extent,extent*1.5),22)]):
        light=bpy.data.objects.new(label+'-light'+str(i),bpy.data.lights.new(label+'-light'+str(i),'AREA'));scene.collection.objects.link(light);light.location=loc;light.data.energy=extent*extent*power;light.data.size=extent;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    scene.world=bpy.data.worlds.new(label+'-world');scene.world.use_nodes=True
    world=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');world.inputs['Color'].default_value=(.035,.044,.05,1);world.inputs['Strength'].default_value=.4
    scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format=next(i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items if i.identifier=='PNG')
    result=os.path.join(WORK,label+'-'+view+'.png');scene.render.filepath=result;bpy.ops.render.render(write_still=True)
    with open(result,'rb') as f:urllib.request.urlopen(urllib.request.Request(BRIDGE+'/candidates/'+label+'-'+view+'.png',data=f.read(),method='POST')).read()
    bpy.context.window.scene=previous
    return {'label':label,'width':width,'height':height,'polygons':sum(len(o.data.polygons) for o in meshes)}
