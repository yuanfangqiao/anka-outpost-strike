"""Author the ANKA chibi duo in Blender. Run through the Blender MCP bridge.

All geometry is original, generated locally. +Z up / -Y front in Blender.
Exported glTF: +Y up / +Z front, metres, feet on the origin.
"""
import bpy
import math
import json
import random
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
random.seed(17)

# Clear the dedicated scene opened for this task.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

def linear(value):
    return value / 12.92 if value < .04045 else ((value + .055) / 1.055) ** 2.4

def rgb(value):
    value = value.lstrip('#')
    return tuple(linear(int(value[i:i+2], 16) / 255) for i in (0,2,4)) + (1,)

PALETTE = {
    'skin':'F3BA8C', 'skin_light':'FFD5A9', 'skin_shadow':'DA8F69', 'blush':'E79783',
    'white':'FFF9E9', 'ink':'25232D', 'black':'191D29', 'navy':'283448',
    'slate':'465366', 'light':'98A9B5', 'silver':'CAD6DD', 'brown':'693820',
    'hair':'64321D', 'hair_hi':'8B4B29', 'hair_dark':'3C251F', 'iris':'A2632E',
    'red':'D94034', 'red_hi':'F56544', 'red_dark':'9A292B', 'gold':'F2B956',
    'pink':'ED669C', 'pink_hi':'FF9CBF', 'pink_dark':'B63D79', 'cyan':'6CD9E3',
    'sole':'20232D', 'canvas':'6A6959', 'cream':'EEE2CE',
}

MATERIALS = {}
for name, roughness, metallic in [('Surface',.66,0),('Hardware',.37,.72),('Optics',.19,.28),('Signal',.35,.05)]:
    mat = bpy.data.materials.new('ANKA_' + name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    vertex = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Color'
    mat.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Base Color'])
    if name == 'Signal':
        mat.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = .6
    MATERIALS[name] = mat

CURRENT = None

def finish(obj, name, color, bone='spine', material='Surface', smooth=True):
    obj.name = name
    # Apply geometry transforms before creating rigid vertex groups.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    CURRENT['collection'].objects.link(obj)
    obj.data.materials.clear()
    obj.data.materials.append(MATERIALS[material])
    layer = obj.data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    c = rgb(PALETTE.get(color, color))
    for item in layer.data:
        item.color = c
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    CURRENT['parts'].append(obj)
    obj.select_set(False)
    return obj

def sphere(name, pos, scale, color, bone='spine', material='Surface', segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj,name,color,bone,material)

def box(name,pos,scale,color,bone='spine',bevel=.025,material='Surface',rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos,rotation=rot)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges','BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj,name,color,bone,material,smooth=False)

def cylinder(name,a,b,r,color,bone='spine',r2=None,material='Surface',vertices=16):
    a,b=Vector(a),Vector(b)
    delta=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=delta.length,location=(a+b)/2)
    obj=bpy.context.object
    obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return finish(obj,name,color,bone,material)

def tube(name, points, radius, color, bone='spine', material='Surface', sides=8):
    points=[Vector(p) for p in points]
    verts=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        n=tangent.cross(Vector((0,1,0)))
        if n.length<.001:
            n=tangent.cross(Vector((1,0,0)))
        n.normalize()
        m=tangent.cross(n).normalized()
        rad = radius[i] if isinstance(radius,(tuple,list)) else radius
        for j in range(sides):
            angle=2*math.pi*j/sides
            verts.append(p+rad*(math.cos(angle)*n+math.sin(angle)*m))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides):
            k=i*sides+j
            faces.append((k,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,k+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+j for j in range(sides))])
    return mesh(name,verts,faces,color,bone,material)

def mesh(name,vertices,faces,color,bone='spine',material='Surface',smooth=True):
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices,[],faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    return finish(obj,name,color,bone,material,smooth)

def loft(name, rings,color,bone='spine',segments=24):
    # Rings: (z, half_width, half_depth, y_centre)
    verts=[]
    for z,rx,ry,y in rings:
        for j in range(segments):
            a=2*math.pi*j/segments
            verts.append((rx*math.cos(a),y+ry*math.sin(a),z))
    faces=[]
    for i in range(len(rings)-1):
        for j in range(segments):
            faces.append((i*segments+j,i*segments+(j+1)%segments,(i+1)*segments+(j+1)%segments,(i+1)*segments+j))
    faces.extend([tuple(range(segments-1,-1,-1)),tuple((len(rings)-1)*segments+j for j in range(segments))])
    return mesh(name,verts,faces,color,bone)

def hair_lock(name,points,widths,color,bone='head',depth=.65):
    # A tapered swept lock with an oval cross-section, ending at a sharp tip.
    points=[Vector(p) for p in points]
    verts=[]
    sides=8
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        n=Vector((0,1,0))
        m=tangent.cross(n).normalized()
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append(p+widths[i]*(math.cos(a)*m+depth*math.sin(a)*n))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple(range(sides-1,-1,-1)))
    faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    return mesh(name,verts,faces,color,bone)

def face_and_hair(female):
    skin_rings=[(1.10,.105,.11,0),(1.135,.19,.18,-.015),(1.20,.28,.235,-.008),(1.30,.345,.28,0),(1.44,.365,.300,0),(1.58,.36,.292,.012),(1.71,.305,.255,.025),(1.79,.20,.18,.025),(1.825,.025,.025,.025)]
    loft('Sculpted cheek and jaw',skin_rings,'skin','head',32)
    sphere('Nose',(0,-.303,1.345),(.036,.045,.035),'skin_light','head',segments=16,rings=10)
    for s in (-1,1):
        sphere('Ear',(s*.357,.0,1.39),(.060,.046,.085),'skin','head',segments=16,rings=10)
        sphere('Inner ear',(s*.383,-.025,1.39),(.028,.022,.045),'skin_shadow','head',segments=12,rings=8)
        # White, coloured iris, pupil, two catchlights. All opaque for glTF.
        eye=sphere('Eye white',(s*.144,-.277,1.441),(.103,.052,.123),'white','head',material='Optics',segments=24,rings=16)
        sphere('Iris',(s*.137,-.323,1.435),(.060,.021,.085),'pink_dark' if female else 'iris','head','Optics',24,16)
        sphere('Pupil',(s*.137,-.341,1.439),(.031,.009,.060),'ink','head','Optics',20,12)
        sphere('Large catchlight',(s*.137-.020,-.350,1.470),(.019,.005,.025),'white','head','Signal',12,8)
        sphere('Small catchlight',(s*.137+.020,-.349,1.409),(.009,.005,.012),'white','head','Signal',10,6)
        top=[(s*(.052+.18*i/10),-.315+.036*(i/10)**2,1.478+.078*math.sin(math.pi*i/13)) for i in range(11)]
        tube('Upper eyelid',top,.008 if female else .006,'ink','head')
        if female:
            tube('Outer lash',[(s*.218,-.298,1.505),(s*.245,-.290,1.526)],.009,'ink','head')
        brow=[(s*.068,-.276,1.600),(s*.138,-.282,1.622),(s*.220,-.247,1.604)]
        tube('Expressive eyebrow',brow,[.015,.018,.010],'pink_dark' if female else 'hair_dark','head')
        sphere('Cheek blush',(s*.245,-.233,1.321),(.047,.010,.018),'blush','head',segments=16,rings=8)
    smile=[(-.069,-.264,1.273),(-.037,-.282,1.261),(0,-.289,1.257),(.039,-.280,1.266),(.066,-.265,1.281)]
    tube('Smile',smile,.006,'brown','head')
    tube('Lower lip highlight',[(-.026,-.280,1.242),(0,-.284,1.239),(.025,-.280,1.245)],.004,'skin_light','head')
    # Hair cap, longer at back and sides than on forehead.
    verts=[]
    seg=40
    for row in range(13):
        for j in range(seg):
            phi=2*math.pi*j/seg
            front=max(0,-math.sin(phi))
            end=1.92-.72*front**3
            theta=.018+(end-.018)*row/12
            verts.append((.386*math.sin(theta)*math.cos(phi),.025+.323*math.sin(theta)*math.sin(phi),1.455+.415*math.cos(theta)))
    faces=[]
    for row in range(12):
        for j in range(seg):
            faces.append((row*seg+j,row*seg+(j+1)%seg,(row+1)*seg+(j+1)%seg,(row+1)*seg+j))
    mesh('Sculpted hair cap',verts,faces,'pink' if female else 'hair','head')
    if female:
        locks=[
          ([(-.19,-.20,1.78),(-.17,-.30,1.68),(-.25,-.29,1.53),(-.29,-.25,1.44)],[.105,.11,.07,.005]),
          ([(.01,-.27,1.79),(.11,-.33,1.72),(.16,-.33,1.61),(.16,-.30,1.55)],[.10,.105,.055,.004]),
          ([(-.07,-.29,1.78),(-.04,-.35,1.68),(.04,-.34,1.59),(.08,-.31,1.56)],[.08,.08,.04,.003]),
          ([(.24,-.20,1.72),(.31,-.23,1.59),(.31,-.20,1.40),(.27,-.15,1.31)],[.07,.08,.055,.004]),
          ([(-.30,-.15,1.65),(-.34,-.19,1.50),(-.32,-.16,1.34),(-.28,-.12,1.29)],[.065,.07,.04,.003]),
        ]
        for i,(p,w) in enumerate(locks):
            hair_lock('Pink fringe %02d'%i,p,w,'pink_hi' if i in (0,2) else 'pink')
        # Swept high ponytail with multiple sculpted strands.
        sphere('Ponytail tie',(.31,.19,1.745),(.094,.082,.094),'black','head',segments=16,rings=10)
        paths=[
         ([(.33,.22,1.77),(.53,.27,1.84),(.67,.28,1.70),(.67,.27,1.45),(.57,.19,1.22),(.66,.11,1.18)],[.09,.15,.16,.13,.075,.003]),
         ([(.34,.22,1.78),(.49,.31,1.90),(.62,.35,1.80),(.67,.38,1.56),(.64,.35,1.30),(.74,.24,1.26)],[.07,.12,.12,.10,.06,.003]),
         ([(.36,.18,1.76),(.51,.16,1.79),(.60,.13,1.59),(.57,.12,1.38),(.49,.10,1.29),(.56,.04,1.25)],[.08,.11,.105,.08,.04,.002]),
        ]
        for i,(p,w) in enumerate(paths):
            hair_lock('Ponytail strand %02d'%i,p,w,'pink_hi' if i==1 else 'pink','ponytail',.95)
        tube('Ponytail highlight',[(.49,.135,1.78),(.574,.10,1.65),(.573,.09,1.48),(.526,.075,1.36)],[.011,.014,.011,.004],'pink_hi','ponytail')
        # Headset arc and ear pads.
        arc=[(.407*math.cos(math.pi*i/20),.015,1.47+.435*math.sin(math.pi*i/20)) for i in range(21)]
        tube('Headset band',arc,.030,'black','head')
        for s in (-1,1):
            cylinder('Ear cup frame',(s*.35,.015,1.40),(s*.427,.015,1.40),.098,'ink','head',vertices=24)
            cylinder('Ear cup pink ring',(s*.425,.015,1.40),(s*.446,.015,1.40),.075,'pink_dark','head',material='Hardware',vertices=24)
            cylinder('Ear cup accent',(s*.446,.015,1.40),(s*.450,.015,1.40),.044,'pink','head',vertices=20)
        tube('Microphone boom',[(-.427,-.025,1.37),(-.42,-.17,1.29),(-.31,-.28,1.27)],.010,'slate','head')
        sphere('Microphone',(-.30,-.282,1.269),(.031,.023,.019),'black','head',segments=12,rings=8)
    else:
        locks=[
         ([(-.28,-.16,1.76),(-.28,-.29,1.68),(-.34,-.27,1.55),(-.35,-.20,1.49)],[.10,.11,.055,.003]),
         ([(-.17,-.22,1.83),(-.15,-.35,1.73),(-.23,-.35,1.63),(-.29,-.30,1.60)],[.12,.12,.06,.003]),
         ([(-.03,-.24,1.85),(.04,-.36,1.74),(.01,-.37,1.64),(-.07,-.34,1.60)],[.12,.12,.055,.003]),
         ([(.13,-.20,1.83),(.22,-.32,1.74),(.20,-.35,1.64),(.12,-.33,1.60)],[.10,.11,.06,.003]),
         ([(.28,-.13,1.75),(.34,-.24,1.62),(.31,-.25,1.50),(.27,-.20,1.45)],[.09,.08,.045,.003]),
         ([(-.18,.04,1.85),(-.20,-.01,1.96),(-.31,-.02,1.97)],[.10,.07,.003]),
         ([(.01,.03,1.87),(.04,-.03,2.00),(-.07,-.06,2.03)],[.10,.07,.003]),
         ([(.22,.08,1.80),(.34,.06,1.88),(.39,.0,1.89)],[.10,.065,.003]),
        ]
        for i,(p,w) in enumerate(locks):
            hair_lock('Tousled hair lock %02d'%i,p,w,'hair_hi' if i in (1,3,5) else 'hair')
        for s in (-1,1):
            hair_lock('Sideburn',[(s*.34,-.10,1.55),(s*.35,-.13,1.40),(s*.31,-.16,1.34)],[.042,.035,.002],'hair_dark')
    # Raised aviator goggles, with separate rim / inset dark lenses / reflections.
    tube('Goggle strap',[(-.36,-.04,1.68),(-.35,.20,1.72),(0,.335,1.76),(.35,.20,1.72),(.36,-.04,1.68)],.023,'black','head')
    for s in (-1,1):
        rot=(math.radians(24),s*math.radians(-8),s*math.radians(6))
        box('Goggle rubber',(s*.16,-.263,1.776),(.285,.092,.173),'black','head',.048,rot=rot)
        box('Goggle metal rim',(s*.16,-.311,1.790),(.253,.052,.153),'pink_dark' if female else 'gold','head',.042,'Hardware',rot)
        box('Goggle lens',(s*.16,-.340,1.802),(.215,.023,.117),'navy','head',.036,'Optics',rot)
        tube('Lens reflection',[(s*.16-.064,-.356,1.824),(s*.16-.028,-.367,1.844),(s*.16+.016,-.361,1.848)],.007,'silver','head','Optics')
    tube('Goggle bridge',[(-.04,-.324,1.79),(0,-.342,1.806),(.04,-.324,1.79)],.015,'pink_dark' if female else 'gold','head','Hardware')

def outfit(female):
    accent='pink' if female else 'red'
    light='pink_hi' if female else 'red_hi'
    dark='pink_dark' if female else 'red_dark'
    # Tapered torso with a fitted panelled jacket over a light undershirt.
    loft('Jacket torso',[(.68,.18,.115,0),(.74,.20,.14,0),(.92,.245,.155,0),(1.08,.257,.146,.005),(1.14,.19,.115,.01)],'black' if female else accent,'spine')
    loft('Undershirt',[(.77,.087,.015,-.145),(.98,.105,.020,-.150),(1.12,.10,.020,-.117)],'cream','spine',16)
    for s in (-1,1):
        box('Jacket front panel',(s*.148,-.132,.957),(.108,.044,.297),'slate' if female else accent,'spine',.024,rot=(0,s*.10,s*.10))
        tube('Panel piping',[(s*.108,-.165,1.102),(s*.10,-.185,.94),(s*.108,-.162,.80)],.008,accent if female else 'gold','spine')
        box('Utility shoulder strap',(s*.175,-.118,1.084),(.065,.035,.15),'black','spine',.012,rot=(0,0,s*.15))
        box('Strap buckle',(s*.173,-.142,1.06),(.052,.015,.037),'light','spine',.006,'Hardware')
    box('Chest patch',(.171,-.166,.983),(.065,.013,.056),dark,'spine',.008)
    tube('Patch chevron',[(.149,-.176,.99),(.17,-.178,.977),(.191,-.176,.993)],.005,'white','spine')
    cylinder('Neck',(0,0,1.095),(0,0,1.25),.084,'skin','neck')
    if not female:
        loft('Scarf collar',[(1.105,.18,.126,.0),(1.15,.174,.132,.0),(1.196,.126,.105,0)],'red_hi','neck')
        sphere('Scarf knot',(-.14,-.111,1.13),(.065,.046,.054),'red','neck',segments=16,rings=10)
        hair_lock('Scarf tail',[(-.16,-.06,1.13),(-.28,.02,1.06),(-.38,.08,1.015),(-.46,.1,1.045)],[.056,.06,.043,.005],'red','scarf',.30)
    else:
        tube('Collar trim',[(-.14,-.10,1.13),(-.09,-.16,1.11),(0,-.176,1.07),(.09,-.16,1.11),(.14,-.10,1.13)],.014,'pink','spine')
        cylinder('Neck choker',(0,0,1.18),(0,0,1.205),.09,'black','neck')
        box('Choker clasp',(0,-.092,1.192),(.032,.012,.021),'pink','neck',.004,'Hardware')
    # Tactical shorts / trousers. Separate hips and legs preserve articulation.
    loft('Pelvis',[(.595,.19,.132,.0),(.70,.206,.14,.0),(.75,.187,.13,0)],'black' if female else 'navy','hips')
    loft('Waist belt',[(.711,.209,.147,0),(.755,.201,.145,0)],'sole','hips')
    box('Belt buckle',(0,-.150,.73),(.073,.025,.052),'silver','hips',.008,'Hardware')
    box('Buckle inset',(0,-.165,.73),(.041,.008,.026),'gold' if not female else 'pink','hips',.003)
    box('Belt pouch',(-.205,-.02,.694),(.083,.14,.13),'canvas' if not female else 'slate','hips',.018)
    box('Pouch flap',(-.21,-.094,.718),(.075,.023,.045),'gold' if not female else 'pink','hips',.008)
    for s,label in ((1,'L'),(-1,'R')):
        thigh='thigh.'+label
        shin='shin.'+label
        foot='foot.'+label
        x=s*.132
        if female:
            cylinder('Shorts leg',(x,0,.66),(s*.148,-.006,.535),.116,'black',thigh,r2=.105,vertices=20)
            cylinder('Shorts trim',(s*.145,-.006,.54),(s*.148,-.006,.515),.109,'pink',thigh,vertices=20)
            cylinder('Thigh',(s*.148,0,.535),(s*.151,.014,.386),.089,'skin',thigh,r2=.079,vertices=20)
            cylinder('Thigh utility strap',(s*.15,.005,.46),(s*.15,.005,.427),.092,'sole',thigh,vertices=20)
            box('Thigh clasp',(s*.15,-.089,.445),(.039,.014,.026),'silver',thigh,.005,'Hardware')
        else:
            cylinder('Trouser thigh',(x,0,.66),(s*.151,.005,.39),.111,'navy',thigh,r2=.094,vertices=20)
            box('Cargo pocket',(s*.223,-.005,.52),(.053,.12,.115),'slate',thigh,.016)
        sphere('Knee joint',(s*.15,.0,.371),(.089,.087,.085),'black',shin,segments=16,rings=10)
        box('Knee guard',(s*.15,-.078,.379),(.133,.056,.128),'pink_dark' if female else 'slate',shin,.034)
        box('Knee inset',(s*.15,-.109,.386),(.081,.011,.048),'pink' if female else 'light',shin,.014)
        cylinder('Boot shaft',(s*.151,.017,.13),(s*.15,.0,.34),.103,'black' if female else 'slate',shin,r2=.092,vertices=20)
        box('Shin armour',(s*.15,-.083,.255),(.137,.05,.159),'slate',shin,.024)
        tube('Shin accent',[(s*.15-.033,-.112,.29),(s*.15,-.116,.265),(s*.15+.033,-.112,.29)],.008,accent,shin)
        box('Boot',(s*.152,-.059,.112),(.238,.337,.184),'black' if female else 'slate',foot,.052)
        box('Toe cap',(s*.152,-.177,.118),(.231,.128,.13),'pink_dark' if female else 'light',foot,.039)
        box('Boot sole',(s*.152,-.062,.035),(.248,.348,.066),'sole',foot,.020)
        box('Sole stripe',(s*.152,-.230,.055),(.195,.008,.014),accent,foot,.003)
        for z in (.155,.199):
            box('Boot strap',(s*.15,-.105,z),(.172,.038,.026),'black',shin,.007)
            box('Boot strap clip',(s*.20,-.127,z),(.027,.012,.026),'silver',shin,.004,'Hardware')
        # Small articulated arms in an approachable relaxed A pose.
        shoulder=(s*.246,0,1.072)
        elbow=(s*.379,-.006,.885)
        wrist=(s*.429,-.043,.751)
        upper='upper_arm.'+label
        lower='forearm.'+label
        hand='hand.'+label
        sphere('Shoulder',shoulder,(.102,.105,.108),accent if not female else 'black',upper,segments=20,rings=12)
        cylinder('Upper sleeve',shoulder,(s*.338,-.004,.944),.106,accent if not female else 'black',upper,r2=.09,vertices=20)
        if female:
            cylinder('Upper arm',(s*.324,-.003,.962),elbow,.076,'skin',upper,r2=.066,vertices=20)
            cylinder('Arm band',(s*.336,-.004,.949),(s*.351,-.004,.925),.079,'pink_dark',upper,vertices=20)
        else:
            cylinder('Sleeve cuff',(s*.328,-.004,.955),(s*.347,-.005,.927),.096,'red_dark',upper,vertices=20)
            cylinder('Bare upper elbow',(s*.34,-.005,.93),elbow,.072,'skin',upper,r2=.067,vertices=20)
        sphere('Elbow',elbow,(.069,.071,.072),'skin',lower,segments=16,rings=10)
        cylinder('Forearm',elbow,wrist,.069,'skin',lower,r2=.064,vertices=20)
        cylinder('Forearm guard',(s*.398,-.02,.836),(s*.427,-.041,.764),.077,'slate',lower,r2=.073,vertices=20)
        box('Wrist panel',(s*.426,-.105,.796),(.079,.025,.065),accent,lower,.012)
        sphere('Gloved hand',(s*.44,-.054,.705),(.078,.070,.083),'black',hand,segments=20,rings=12)
        box('Glove back',(s*.44,-.110,.72),(.10,.03,.066),'slate',hand,.015)
        sphere('Thumb',(s*.390,-.081,.722),(.034,.037,.048),'skin',hand,segments=12,rings=8)
        for i in range(3):
            sphere('Finger knuckle',(s*(.405+.025*i),-.111,.682),(.017,.016,.022),'skin',hand,segments=10,rings=6)
    # Backpack with visible straps, top handle, pockets and badge.
    if not female:
        box('Backpack main',(0,.18,.94),(.355,.20,.345),'canvas','spine',.055)
        box('Backpack flap',(0,.283,1.028),(.327,.075,.14),'slate','spine',.025)
        box('Backpack rear pocket',(0,.295,.858),(.255,.076,.133),'brown','spine',.022)
        for s in (-1,1):
            box('Pack strap',(s*.108,.334,.95),(.032,.016,.22),'sole','spine',.006)
            box('Pack buckle',(s*.108,.346,.957),(.046,.016,.038),'gold','spine',.006,'Hardware')
        tube('Backpack handle',[(-.067,.19,1.106),(-.066,.18,1.157),(.066,.18,1.157),(.067,.19,1.106)],.016,'sole','spine')
    else:
        box('Compact back module',(0,.169,1.012),(.21,.11,.195),'slate','spine',.035)
        box('Back module accent',(0,.232,1.015),(.138,.019,.045),'pink_dark','spine',.012)

def armature(character):
    bpy.ops.object.armature_add(enter_editmode=True, location=(0,0,0))
    rig=bpy.context.object
    rig.name=character['id']+'_Rig'
    for c in list(rig.users_collection):
        c.objects.unlink(rig)
    character['collection'].objects.link(rig)
    bones=rig.data.edit_bones
    bones.remove(bones[0])
    def bone(name,a,b,parent=None):
        item=bones.new(name)
        item.head=a
        item.tail=b
        if parent:
            item.parent=bones[parent]
        return item
    bone('root',(0,0,0),(0,0,.15))
    bone('hips',(0,0,.63),(0,0,.78),'root')
    bone('spine',(0,0,.78),(0,0,1.12),'hips')
    bone('neck',(0,0,1.12),(0,0,1.25),'spine')
    bone('head',(0,0,1.25),(0,0,1.74),'neck')
    bone('ponytail',(.32,.20,1.75),(.60,.24,1.45),'head')
    bone('scarf',(-.16,-.06,1.13),(-.40,.08,1.04),'neck')
    for s,label in ((1,'L'),(-1,'R')):
        bone('thigh.'+label,(s*.132,0,.65),(s*.15,.0,.375),'hips')
        bone('shin.'+label,(s*.15,0,.375),(s*.152,.0,.13),'thigh.'+label)
        bone('foot.'+label,(s*.152,0,.13),(s*.152,-.18,.08),'shin.'+label)
        bone('upper_arm.'+label,(s*.246,0,1.072),(s*.379,-.006,.885),'spine')
        bone('forearm.'+label,(s*.379,-.006,.885),(s*.429,-.043,.751),'upper_arm.'+label)
        bone('hand.'+label,(s*.429,-.043,.751),(s*.44,-.054,.66),'forearm.'+label)
    bone('weapon_socket.R',(-.44,-.054,.705),(-.44,-.22,.705),'hand.R')
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front=True
    for p in rig.pose.bones:
        p.rotation_mode='XYZ'
    character['rig']=rig
    # Combine mesh and preserve vertex groups; four PBR vertex-colour materials.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in character['parts']:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=character['parts'][0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=character['id']+'_Body'
    obj.parent=rig
    mod=obj.modifiers.new('Game skeleton','ARMATURE')
    mod.object=rig
    character['mesh']=obj
    # Merge coincident generated vertices only within each surface. No remesh.
    obj['authoring']='Original procedural Blender geometry; rigid segmented skinning'
    rig['forward']='-Y in Blender / +Z in glTF'
    rig['units']='metres'
    rig['character']=character['id']
    rig['weapon_socket']='weapon_socket.R'
    rig['animation_notes']='In-place clips; locomotion is driven by the game'
    return rig

def animate(character):
    rig=character['rig']
    rig.animation_data_create()
    names=[b.name for b in rig.pose.bones]
    def reset():
        for b in rig.pose.bones:
            b.location=(0,0,0)
            b.rotation_euler=(0,0,0)
            b.scale=(1,1,1)
    def rot(name,x=0,y=0,z=0):
        rig.pose.bones[name].rotation_euler=tuple(math.radians(v) for v in (x,y,z))
    specs=[('Idle',60),('Run',24),('Shoot',12),('Jump',30),('Victory',60)]
    for name,length in specs:
        action=bpy.data.actions.new(character['id']+'|'+name)
        action.use_fake_user=True
        rig.animation_data.action=action
        for f in range(1,length+2,2):
            frame=min(f,length+1)
            t=(frame-1)/length
            phase=math.tau*t
            reset()
            if name=='Idle':
                rig.pose.bones['hips'].location.z=.008*math.sin(phase)
                rot('spine',x=1.2*math.sin(phase))
                rot('head',z=2*math.sin(phase),x=-1)
                rot('upper_arm.L',y=-3,z=-3)
                rot('upper_arm.R',y=3,z=3)
                rot('ponytail',x=4*math.sin(phase+.5))
                rot('scarf',z=4*math.sin(phase+.8))
            elif name=='Run':
                rig.pose.bones['hips'].location.z=.022*(1-math.cos(2*phase))
                rot('spine',x=10,y=3*math.sin(phase))
                rot('head',x=-7,z=-2*math.sin(phase))
                for s,label in ((1,'L'),(-1,'R')):
                    swing=s*math.sin(phase)
                    rot('thigh.'+label,x=34*swing)
                    rot('shin.'+label,x=-max(0,-swing)*55)
                    rot('foot.'+label,x=10*swing)
                    rot('upper_arm.'+label,x=-28*swing,y=s*8)
                    rot('forearm.'+label,x=18)
                rot('ponytail',x=12*math.sin(phase-.5),z=5*math.sin(phase))
                rot('scarf',x=16+6*math.sin(phase))
            elif name=='Shoot':
                recoil=max(0,1-t*3)*7
                rot('spine',x=-recoil,z=-4)
                rot('upper_arm.R',x=72+recoil,y=-8,z=-18)
                rot('forearm.R',x=15)
                rot('upper_arm.L',x=60,y=22,z=23)
                rot('forearm.L',x=31,y=5)
                rot('head',x=2)
                rot('ponytail',x=-recoil)
            elif name=='Jump':
                # Root is stationary: vertical motion is supplied by physics.
                tuck=math.sin(math.pi*t)
                rot('thigh.L',x=25*tuck)
                rot('thigh.R',x=18*tuck)
                rot('shin.L',x=-45*tuck)
                rot('shin.R',x=-30*tuck)
                rot('upper_arm.L',z=-35*tuck,x=20*tuck)
                rot('upper_arm.R',z=35*tuck,x=20*tuck)
                rot('head',x=-6*tuck)
                rot('ponytail',x=18*tuck)
            elif name=='Victory':
                wave=math.sin(phase*2)
                rot('upper_arm.L',x=5,z=-145)
                rot('forearm.L',z=15*wave)
                rot('hand.L',x=18*wave)
                rot('head',z=5*math.sin(phase))
                rot('spine',z=-3*math.sin(phase))
                rig.pose.bones['hips'].location.z=.012*(1-math.cos(phase*2))
                rot('ponytail',x=5*math.sin(phase))
            for b in rig.pose.bones:
                b.keyframe_insert('location',frame=frame,group=b.name)
                b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
        track=rig.animation_data.nla_tracks.new()
        track.name=name
        strip=track.strips.new(name,1,action)
        strip.action_frame_start=1
        strip.action_frame_end=length+1
        strip.extrapolation='NOTHING'
        track.mute=True
    rig.animation_data.action=None
    reset()
    character['clips']=[n for n,l in specs]

characters=[]
for female,identifier in [(False,'male_scout'),(True,'female_striker')]:
    collection=bpy.data.collections.new(identifier)
    bpy.context.scene.collection.children.link(collection)
    CURRENT={'id':identifier,'collection':collection,'parts':[],'female':female}
    face_and_hair(female)
    outfit(female)
    armature(CURRENT)
    animate(CURRENT)
    characters.append(CURRENT)

# Export before placing the two characters side by side for presentation.
report={'generator':'Blender 5.2 / MCP for Blender 2.2.4','units':'metres','up':'+Y','forward':'+Z','origin':'feet','characters':[]}
for character in characters:
    bpy.ops.object.select_all(action='DESELECT')
    character['rig'].select_set(True)
    character['mesh'].select_set(True)
    bpy.context.view_layer.objects.active=character['rig']
    path=ROOT/'assets/characters'/f"{character['id']}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=False,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_nla_strips=True,
        export_force_sampling=True,export_frame_range=False,
        export_skins=True,export_def_bones=False,
        export_materials='EXPORT',export_vertex_color='MATERIAL',export_extras=True,
    )
    data=character['mesh'].data
    data.calc_loop_triangles()
    report['characters'].append({'id':character['id'],'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'triangles':len(data.loop_triangles),'vertices':len(data.vertices),'bones':len(character['rig'].data.bones),'materials':len(data.materials),'animations':character['clips'],'height_m':round(character['mesh'].dimensions.z,3)})

# Presentation collection is deliberately excluded from GLB exports.
stage=bpy.data.collections.new('Presentation (not exported)')
bpy.context.scene.collection.children.link(stage)
CURRENT={'collection':stage,'parts':[]}
for character,x in zip(characters,(-.74,.68)):
    character['rig'].location.x=x
    # Minimal attitude, keeping the mesh fully readable.
    character['rig'].pose.bones['head'].rotation_euler.z=math.radians(-3 if character['female'] else 3)
    character['rig'].pose.bones['upper_arm.L'].rotation_euler.y=math.radians(-3)
    character['rig'].pose.bones['upper_arm.R'].rotation_euler.y=math.radians(3)

def plain_mat(name,hexcolor,metallic=0,rough=.6):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=rgb(hexcolor)
    bsdf.inputs['Roughness'].default_value=rough
    bsdf.inputs['Metallic'].default_value=metallic
    return mat

floor_mat=plain_mat('Stage deep navy','192838',0,.8)
plinth_mat=plain_mat('Stage plinth','293B50',.25,.5)
for x in (-.74,.68):
    bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=.64,depth=.07,location=(x,0,-.041))
    obj=bpy.context.object
    obj.name='Display plinth'
    obj.data.materials.append(plinth_mat)
    bevel=obj.modifiers.new('Rounded rim','BEVEL')
    bevel.width=.015
    bevel.segments=3
    for p in obj.data.polygons:p.use_smooth=True
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.078))
bpy.context.object.name='Infinite studio floor'
bpy.context.object.data.materials.append(floor_mat)

world=bpy.data.worlds.new('Studio world')
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.17,.24,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.38

def area(name,pos,energy,size,color,target=(0,0,1)):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy
    data.shape='DISK'
    data.size=size
    data.color=tuple(int(color[i:i+2],16)/255 for i in (0,2,4))
    obj=bpy.data.objects.new(name,data)
    stage.objects.link(obj)
    obj.location=pos
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj

area('Large warm key',(-3.2,-4.3,5),450,4.0,'FFE6CD')
area('Soft front fill',(3,-4,2.8),220,3.0,'D4E7FF')
area('Cool rim',(1.5,2.0,4),580,3.0,'A4D9FF')
area('Top sheen',(-2,1,4),240,2.0,'FFC4A6')

camera_data=bpy.data.cameras.new('Character review camera')
camera=bpy.data.objects.new('Character review camera',camera_data)
stage.objects.link(camera)
camera.location=(3.0,-8.0,3.0)
camera.rotation_euler=(Vector((0,0,1.0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
camera_data.ortho_scale=3.5
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=1600
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.render.fps=30
scene.frame_start=1
scene.frame_end=61
scene.frame_set(1)

# The opening scene is framed and ready to orbit in Blender.
for screen in bpy.data.screens:
    for area_ in screen.areas:
        if area_.type=='VIEW_3D':
            area_.spaces.active.region_3d.view_distance=5.1
            area_.spaces.active.region_3d.view_location=Vector((0,0,1))
            area_.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area_.spaces.active.clip_end=200
            area_.spaces.active.shading.type='MATERIAL'

for c in characters:
    c['mesh'].select_set(False)
    c['rig'].select_set(False)
scene['README']='ANKA original chibi game characters. GLB exports contain only one rig and skinned mesh each. Source parts are preserved as mesh islands with named vertex groups. See README.md.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source/anka_characters.blend'))
(ROOT/'reports/model-manifest.json').write_text(json.dumps(report,indent=2))
print('ANKA_BUILD_COMPLETE',json.dumps(report))
