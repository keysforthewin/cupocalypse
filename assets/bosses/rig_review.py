import bpy,numpy as np,json,urllib.request,tempfile,os
BRIDGE='http://192.168.8.111:9878'
def rig_review(index,name):
    prior=bpy.context.window.scene;scene=bpy.data.scenes['Boss-'+name];bpy.context.window.scene=scene
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    meshes=[o for o in scene.objects if o.type=='MESH' and not o.name.startswith('living-core')]
    report={'id':name,'poses':[]}
    for track in rig.animation_data.nla_tracks:
        clip=track.name
        if clip in ['idle','entrance','stagger']:continue
        action=track.strips[0].action;rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        scene.frame_set(0);deps=bpy.context.evaluated_depsgraph_get();references={}
        for o in meshes:
            edges=np.array([e.vertices[:] for e in o.data.edges]);p=np.array([v.co[:] for v in o.evaluated_get(deps).data.vertices]);length=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);references[o]=(edges,length)
        for frame in ([60] if clip=='transform' else [90,180] if clip=='death' else [27,36,54]):
            scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();ratios=[]
            for o,(edges,length) in references.items():
                p=np.array([v.co[:] for v in o.evaluated_get(deps).data.vertices]);new=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);valid=length>.001;ratios.extend((new[valid]/length[valid]).tolist())
            values=np.array(ratios);report['poses'].append({'clip':clip,'frame':frame,'p99':float(np.percentile(values,99)),'p999':float(np.percentile(values,99.9)),'max':float(values.max()),'over3':int((values>3).sum()),'edges':len(values)})
    rig.animation_data.action=None
    for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
    data=json.dumps(report,indent=2).encode();urllib.request.urlopen(urllib.request.Request(BRIDGE+'/review/'+name+'-deformation.json',data=data,method='POST')).read();bpy.context.window.scene=prior
    return {'id':name,'maxP99':max(p['p99'] for p in report['poses']),'maxP999':max(p['p999'] for p in report['poses']),'worst':max(report['poses'],key=lambda p:p['over3'])}
