"""Building surface audit/repair. Run through Blender MCP, or blender -b --python.

Only task-owned Building-* scenes are mutated. Existing Biome-* source scenes
are references. Audit meshes are temporary copies: UV seams are welded only for
connectivity analysis. A boundary is evidence to inspect, not automatically a hole.
"""
import bpy, bmesh, json, math, os, tempfile, urllib.request
import numpy as np
from mathutils import Vector

BRIDGE = os.environ.get('BIOME_BRIDGE', 'http://192.168.8.111:9877')
ROOT = os.environ.get('BIOME_ROOT')
WORK = os.path.join(tempfile.gettempdir(), 'march-building-quality')
os.makedirs(WORK, exist_ok=True)

def read(relative):
    if ROOT:
        return open(os.path.join(ROOT, relative), 'rb').read()
    return urllib.request.urlopen(BRIDGE+'/'+relative, timeout=60).read()

def write(relative, data):
    if ROOT:
        path = os.path.join(ROOT, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(data)
    else:
        urllib.request.urlopen(urllib.request.Request(BRIDGE+'/'+relative, data=data, method='POST'), timeout=120).read()

def catalog():
    return json.loads(read('building_catalog.json'))

def source_scene(name):
    scene = bpy.data.scenes.get('Biome-'+name)
    if scene:
        return scene
    path = os.path.join(WORK, name+'-source.blend')
    open(path,'wb').write(read('source/'+name+'.blend'))
    with bpy.data.libraries.load(path) as (src, dst):
        dst.scenes = [n for n in src.scenes if n == 'Biome-'+name]
    if not dst.scenes:
        raise RuntimeError('Missing source scene: '+name)
    return dst.scenes[0]

def copied_mesh(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);bm.transform(obj.matrix_world)
    parts=bm.faces.layers.int.get('structural_part')
    if parts:
        groups={}
        for f in bm.faces:groups.setdefault(f[parts],set()).update(f.verts)
        for verts in groups.values():bmesh.ops.remove_doubles(bm,verts=list(verts),dist=1e-5)
    else:bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bm.normal_update()
    return bm

def regions(bm, min_area=0.12):
    """Connected patches with a consistent plane normal; trim remains separate.

    Use an anchored normal, not transitive angle smoothing, so curved surfaces
    cannot become a single increasingly curved 'plane'. UV boundaries do not
    determine geometry connectivity.
    """
    remaining=set(bm.faces); patches=[]
    ordered=sorted(bm.faces, key=lambda f:f.calc_area(), reverse=True)
    for seed in ordered:
        if seed not in remaining:continue
        remaining.remove(seed)
        normal=seed.normal.copy(); stack=[seed]; faces=[seed]
        while stack:
            f=stack.pop()
            for e in f.edges:
                if len(e.link_faces)!=2:continue
                for other in e.link_faces:
                    if other in remaining and other.normal.dot(normal)>.94:
                        remaining.remove(other);stack.append(other);faces.append(other)
        if len(faces)<8:continue
        area=sum(f.calc_area() for f in faces)
        if area<min_area:continue
        verts=list({v for f in faces for v in f.verts})
        points=np.array([tuple(v.co) for v in verts]);center=points.mean(axis=0)
        _,_,axes=np.linalg.svd(points-center,full_matrices=False)
        normal=axes[-1];dist=(points-center)@normal
        span=float(np.linalg.norm(np.ptp(points,axis=0)))
        if span<.4:continue
        patches.append({'faces':faces,'verts':verts,'normal':normal,'center':center,
                        'area':area,'span':span,'rms':float(np.sqrt(np.mean(dist**2))),
                        'max':float(np.max(np.abs(dist)))})
    return patches

def audit_scene(scene, name, stage):
    row={'id':name,'stage':stage,'blender':bpy.app.version_string,'meshes':0,
         'triangles':0,'degenerateFaces':0,'windingConflicts':0,'nonManifoldEdges':0,
         'boundaryEdges':0,'missingUV':0,'collapsedUV':0,'patches':[],'components':[]}
    for obj in scene.objects:
        if obj.type!='MESH':continue
        row['meshes']+=1
        bm=copied_mesh(obj)
        row['triangles']+=sum(len(f.verts)-2 for f in bm.faces)
        row['degenerateFaces']+=sum(f.calc_area()<1e-10 for f in bm.faces)
        row['windingConflicts']+=sum(e.is_manifold and not e.is_contiguous for e in bm.edges)
        row['nonManifoldEdges']+=sum(len(e.link_faces)>2 for e in bm.edges)
        row['boundaryEdges']+=sum(e.is_boundary for e in bm.edges)
        uv=bm.loops.layers.uv.active
        if uv is None:row['missingUV']+=1
        else:
            for f in bm.faces:
                coords=[l[uv].uv for l in f.loops]
                area=sum(a.x*b.y-b.x*a.y for a,b in zip(coords,coords[1:]+coords[:1]))/2
                if abs(area)<1e-12 and f.calc_area()>1e-8:row['collapsedUV']+=1
        for p in regions(bm):
            row['patches'].append({k:p[k] for k in ['area','span','rms','max']})
        remaining=set(bm.faces)
        while remaining:
            seed=remaining.pop();stack=[seed];faces=[seed]
            while stack:
                for e in stack.pop().edges:
                    for f in e.link_faces:
                        if f in remaining:remaining.remove(f);stack.append(f);faces.append(f)
            edges={e for f in faces for e in f.edges}
            closed=all(len(e.link_faces)==2 for e in edges)
            row['components'].append({'faces':len(faces),'closed':closed,'area':sum(f.calc_area() for f in faces)})
        bm.free()
    write('quality/'+stage+'/'+name+'.json', json.dumps(row).encode())
    return {k:v for k,v in row.items() if k not in ['components','patches']}

def copy_scene(name):
    source=source_scene(name)
    existing=bpy.data.scenes.get('Building-'+name)
    if existing:
        for obj in list(existing.objects):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(existing)
    scene=bpy.data.scenes.new('Building-'+name)
    for obj in source.objects:
        if obj.type!='MESH':continue
        new=obj.copy();new.data=obj.data.copy();new.parent=None
        new.matrix_world=obj.matrix_world.copy();scene.collection.objects.link(new)
    return scene

def repair(name):
    scene=copy_scene(name)
    log={'id':name,'flattenedPatches':0,'maxDisplacement':0,'removedDuplicateFaces':0}
    for obj in scene.objects:
        bm=copied_mesh(obj)
        # Detect geometrically identical faces regardless of winding before normals.
        seen=set();duplicate=[]
        for f in bm.faces:
            key=frozenset(f.verts)
            if key in seen:duplicate.append(f)
            seen.add(key)
        log['removedDuplicateFaces']+=len(duplicate)
        if duplicate:bmesh.ops.delete(bm,geom=duplicate,context='FACES_ONLY')
        bmesh.ops.dissolve_degenerate(bm,dist=1e-6,edges=list(bm.edges))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.normal_update()
        # Only broad, almost planar regions. Keep curved objects and ruins intact.
        if name not in catalog()['curvedStructures'] and not name.startswith('ash-'):
            patches=regions(bm,min_area=.3)
            for p in patches:
                if p['rms']<.001 or p['max']>min(.08,p['span']*.025):continue
                normal=Vector(p['normal']);center=Vector(p['center'])
                # Interior vertices only: touching relief/seams cannot be dragged.
                selected=set(p['faces']);count=0
                for v in p['verts']:
                    if any(f not in selected for f in v.link_faces):continue
                    distance=(v.co-center).dot(normal)
                    v.co-=normal*distance
                    log['maxDisplacement']=max(log['maxDisplacement'],abs(distance));count+=1
                if count:log['flattenedPatches']+=1
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
        # Flat normals for broad planar face regions; preserve relief shading.
        for p in regions(bm,min_area=.3):
            if p['rms']<.0005:
                for f in p['faces']:f.smooth=False
        bm.to_mesh(obj.data);bm.free();obj.matrix_world.identity();obj.data.update()
    write('quality/repair/'+name+'-changes.json',json.dumps(log).encode())
    return log,audit_scene(scene,name,'repair')

def export_scene(name, scene=None):
    scene=scene or bpy.data.scenes['Building-'+name]
    old=bpy.context.window.scene if bpy.context.window else None
    try:
        if bpy.context.window:bpy.context.window.scene=scene
        bpy.context.view_layer.update()
        meshes=[o for o in scene.objects if o.type=='MESH']
        points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
        lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
        hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
        audit_scene(scene,name,'final')
        for o in meshes:o.select_set(True,view_layer=scene.view_layers[0])
        path=os.path.join(WORK,name+'.glb')
        with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
            bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_attributes=True,export_extras=True)
        write('processed/'+name+'.glb',open(path,'rb').read())
        info={'id':name,'width':hi.x-lo.x,'depth':hi.y-lo.y,'height':hi.z-lo.z,
              'blender':bpy.app.version_string,'source':'Blender building quality repair',
              'qualitySource':meshes[0].get('quality_source','assets/biomes/blender_buildings.py'),
              'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),
              'simplify':False}
        write('processed/'+name+'.json',json.dumps(info).encode())
        path=os.path.join(WORK,name+'.blend');bpy.data.libraries.write(path,{scene},fake_user=True,compress=True)
        write('quality/source/'+name+'.blend',open(path,'rb').read())
        return info
    finally:
        if old:bpy.context.window.scene=old

if __name__=='__main__':
    import sys,argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['audit','repair','export','rebuild']);parser.add_argument('ids',nargs='*')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for name in args.ids or catalog()['assets']:
        if args.action=='audit':print(audit_scene(source_scene(name),name,'baseline'))
        elif args.action=='rebuild':
            architecture={'__name__':'architecture'};exec(read('blender_architecture.py'),architecture)
            if name in ['forest-lookout','ash-pylon']:
                repair(name);scene=bpy.data.scenes['Building-'+name]
            else:scene=architecture['rebuild'](name,globals())
            print(audit_scene(scene,name,'rebuilt'));print(export_scene(name,scene))
        else:
            print(repair(name))
            if args.action=='export':print(export_scene(name))
