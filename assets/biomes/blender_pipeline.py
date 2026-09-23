"""Run in Blender via MCP. Dedicated scene; transfers only biome files."""
import bpy, urllib.request, os, json, math, tempfile
from mathutils import Vector
BRIDGE='http://192.168.8.111:9877'
SIZES={'city-kiosk':(2.6,0),'city-water-tower':(3.5,0),'suburb-house':(7.5,0),'suburb-car':(4.5,0),'country-barn':(9,0),'country-tractor':(3.6,0),'forest-rock':(3.2,0),'forest-stump':(2.1,0),'ash-ruin':(8,0),'ash-wreck':(5,0)}
SIZES.update({'city-tenement':(8,0),'city-offices':(8,0),'suburb-cottage':(7.5,0),'country-barn-stone':(9,0),'forest-cabin':(6,0),'ash-ruin-arcade':(8,0)})
work=os.path.join(tempfile.gettempdir(),'march-biomes');os.makedirs(work,exist_ok=True)
def upload(path,remote):
    with open(path,'rb') as f: data=f.read()
    req=urllib.request.Request(BRIDGE+'/'+remote,data=data,method='POST')
    return urllib.request.urlopen(req,timeout=120).status

def process_asset(name):
    source=os.path.join(work,name+'.glb')
    urllib.request.urlretrieve(BRIDGE+'/originals/'+name+'.glb',source)
    old=bpy.context.window.scene
    scene=bpy.data.scenes.get('Biome-'+name) or bpy.data.scenes.new('Biome-'+name)
    bpy.context.window.scene=scene
    # Only replace objects in this task-owned scene.
    for obj in list(scene.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes=[o for o in scene.objects if o.type=='MESH']
    bpy.context.view_layer.update()
    points=[o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    low=Vector(tuple(min(v[i] for v in points) for i in range(3)))
    high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    width=SIZES[name][0];scale=width/max(high.x-low.x,high.y-low.y)
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root)
    for obj in list(scene.objects):
        if obj!=root and obj.parent is None: obj.parent=root
    root.scale=(scale,)*3;root.location=Vector((-(low.x+high.x)/2,-(low.y+high.y)/2,-low.z))*scale
    for obj in meshes:
        # Remove only disconnected microscopic fragments; preserve authored geometry.
        obj.name=name+'-'+obj.name
        for material in obj.data.materials:
            if material and material.use_nodes:
                node=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                if node and not node.inputs['Roughness'].is_linked: node.inputs['Roughness'].default_value=.78
    if name.startswith('ash-') or name=='forest-rock':
        import numpy as np
        seen=set()
        for obj in meshes:
            for mat in obj.data.materials:
                if not mat or not mat.use_nodes: continue
                node=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                if not node or not node.inputs['Base Color'].is_linked:continue
                source=node.inputs['Base Color'].links[0].from_node
                if source.type!='TEX_IMAGE' or not source.image or source.image.name in seen:continue
                im=source.image;seen.add(im.name);pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels);p=pixels.reshape(-1,4)
                lum=p[:,0]*.2126+p[:,1]*.7152+p[:,2]*.0722
                blend=.87 if name.startswith('ash-ruin') else .62
                for channel,factor in enumerate([.62,.68,.63] if name=='forest-rock' else [.78,.74,.68]):p[:,channel]=(p[:,channel]*(1-blend)+lum*blend)*factor
                im.pixels.foreach_set(pixels);im.update();im.pack()
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='SELECT')
    output=os.path.join(work,name+'-processed.glb')
    formats=[i.identifier for i in bpy.ops.export_scene.gltf.get_rna_type().properties['export_format'].enum_items]
    bpy.ops.export_scene.gltf(filepath=output,export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
    upload(output,'processed/'+name+'.glb')
    # Save task sources without changing the open document's filepath.
    blend=os.path.join(work,name+'.blend')
    bpy.data.libraries.write(blend,{scene},fake_user=True,compress=True)
    upload(blend,'source/'+name+'.blend')
    dimensions=[(high[i]-low[i])*scale for i in range(3)]
    report={'id':name,'width':dimensions[0],'depth':dimensions[1],'height':dimensions[2],'blender':bpy.app.version_string,'triangles':sum(len(o.data.polygons) for o in meshes)}
    path=os.path.join(work,name+'.json');open(path,'w').write(json.dumps(report));upload(path,'processed/'+name+'.json')
    bpy.context.window.scene=old
    return report
