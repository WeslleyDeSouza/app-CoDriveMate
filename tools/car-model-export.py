"""
Turns the purchased Blender model of the car into the GLB the 3D view loads.

    blender --background "models/Citroen_Xsara_Picasso_(Mk1f)_2004.blend" \
        --python tools/car-model-export.py -- public/models/car.glb [preview-folder]

What the view expects (src/app/domains/scene3d/infrastructure/three-scene.ts):
root node `XsaraPicasso`, front towards -Z, metres, wheels as nodes named `wheel…` with
their origin in the wheel centre, paint material `paint`, tail light material `tail`.

The source has about 794 000 triangles in 130 loose parts, more than a tablet should draw
for one car. Everything stays (interior behind see-through glass, lamps behind their
covers), but reduced part by part to TARGET_TRIS, most where it is seen least.
"""

import math
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

TARGET_TRIS = 160_000
CAR_LENGTH_M = 4.28

args = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
OUT = args[0] if args else 'public/models/car.glb'
PREVIEW = args[1] if len(args) > 1 else ''

# The glue line of the windows only: it hides the interior behind the glass.
DROP = re.compile(r'^(gluing_area)')
# Letters fall apart when reduced.
UNTOUCHED = re.compile(r'^(LicPlate|citroen|xara|picasso)')
# How much of each part stays, before everything is scaled to the target together.
KEEP = [
    (r'^body$', 0.3),
    (r'^rim\d', 0.12),
    (r'^tyre', 0.15),
    (r'^cap_on_rim', 0.06),
    (r'^(interior|seat|torpedo)', 0.05),
    (r'^front_light_part003', 0.03),
    (r'^(front_light_|reflector|rear_light_body|lense)', 0.08),
    (r'^(front|rear|side)_window|^sunroof_window', 0.25),
    (r'^box_for_windscreen_wiper', 0.05),
    (r'^(front_bumper_part|rubber_rim)', 0.1),
]
KEEP_OTHERWISE = 0.2
MIN_TRIS = 24

# name in the source -> (name in the app, colour, metallic, roughness, coat, emission, alpha)
MATERIALS = {
    'carpaint': ('paint', (0.004, 0.004, 0.005), 0.5, 0.26, 1.0, None, 1),
    'windowglass': ('glass', (0.01, 0.014, 0.018), 0.0, 0.03, 0.0, None, 0.42),
    'redglass': ('tail', (0.45, 0.007, 0.011), 0.1, 0.2, 0.0, (0.25, 0.0, 0.0), 1),
    'clearglass': ('lampglass', (0.85, 0.9, 0.95), 0.0, 0.02, 0.0, None, 0.22),
    'orangeglass': ('indicator', (0.8, 0.3, 0.02), 0.2, 0.2, 0.0, None, 1),
    'black': ('trim', (0.012, 0.013, 0.015), 0.0, 0.55, 0.0, None, 1),
    'interior': ('interior', (0.05, 0.05, 0.055), 0.0, 0.8, 0.0, None, 1),
    'chrome': ('chrome', (0.85, 0.85, 0.85), 1.0, 0.08, 0.0, None, 1),
    'mirror': ('chrome', (0.85, 0.85, 0.85), 1.0, 0.08, 0.0, None, 1),
    'mattemetal': ('alloy', (0.69, 0.72, 0.77), 0.85, 0.22, 0.0, None, 1),
    'rim': ('alloy', (0.69, 0.72, 0.77), 0.85, 0.22, 0.0, None, 1),
    'tire': ('rubber', (0.008, 0.008, 0.009), 0.0, 0.9, 0.0, None, 1),
    'brakedisk': ('disc', (0.2, 0.2, 0.2), 0.9, 0.4, 0.0, None, 1),
}
SOURCE = 'source:'
# The number plates stay empty: the source carries the name of its maker on them.
PLATE_LETTERING = ('Material__2', 'Material__4')
WHEEL_PARTS = re.compile(r'^(tyre|rim|cap_on_rim|cap_part|brakedisk)')


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bounds(objs):
    points = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    return low, high


def centre(obj):
    low, high = bounds([obj])
    return (low + high) / 2


def source_name(slot):
    return slot.material.name.removeprefix(SOURCE) if slot.material else ''


def material(name, colour, metallic, roughness, coat, emission, alpha):
    made = bpy.data.materials.get(name)
    if made:
        return made
    made = bpy.data.materials.new(name)
    made.use_nodes = True
    shader = made.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if coat:
        shader.inputs['Coat Weight'].default_value = coat
        shader.inputs['Coat Roughness'].default_value = 0.06
    if emission:
        shader.inputs['Emission Color'].default_value = (*emission, 1)
        shader.inputs['Emission Strength'].default_value = 1
    if alpha < 1:
        # Exported as alpha blending: see-through without the cost of refraction.
        shader.inputs['Alpha'].default_value = alpha
        made.surface_render_method = 'BLENDED'
    return made


def join(objs, name):
    with bpy.context.temp_override(
        active_object=objs[0], selected_objects=objs, selected_editable_objects=objs
    ):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def all_meshes():
    # Joined parts are gone: always ask the file again instead of keeping references.
    return [o for o in bpy.data.objects if o.type == 'MESH']


# ---- only the meshes
for obj in list(bpy.data.objects):
    if obj.type != 'MESH' or DROP.match(obj.name):
        bpy.data.objects.remove(obj, do_unlink=True)
before = sum(tris(o) for o in all_meshes())

# ---- front towards +Y (-Z in glTF), real length, standing on the ground
low, high = bounds(all_meshes())
turn = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(
    Vector((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
)
fit = Matrix.Scale(CAR_LENGTH_M / (high.y - low.y), 4) @ turn
for obj in all_meshes():
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    obj.data.transform(fit @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()

# ---- the materials the app knows. The old ones get out of the way first: `chrome` is a
# name of the source too. A fixed list, because renaming re-sorts the collection.
for old in list(bpy.data.materials):
    if not old.name.startswith(SOURCE):
        old.name = SOURCE + old.name
for obj in all_meshes():
    for slot in obj.material_slots:
        known = MATERIALS.get(source_name(slot))
        if known:
            slot.material = material(*known)

for obj in all_meshes():
    if not obj.name.startswith('LicPlate'):
        continue
    plate = bmesh.new()
    plate.from_mesh(obj.data)
    lettering = [
        face
        for face in plate.faces
        if source_name(obj.material_slots[face.material_index]) in PLATE_LETTERING
    ]
    bmesh.ops.delete(plate, geom=lettering, context='FACES')
    plate.to_mesh(obj.data)
    plate.free()

# ---- less of everything
wanted = {}
reduced = [o for o in all_meshes() if not UNTOUCHED.match(o.name)]
for obj in reduced:
    keep = next((share for pattern, share in KEEP if re.match(pattern, obj.name)), KEEP_OTHERWISE)
    wanted[obj.name] = max(MIN_TRIS, tris(obj) * keep)
left = TARGET_TRIS - sum(tris(o) for o in all_meshes() if UNTOUCHED.match(o.name))
scale = left / sum(wanted.values())
for obj in reduced:
    ratio = min(1.0, wanted[obj.name] * scale / max(1, tris(obj)))
    if ratio < 0.98:
        with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj]):
            weld = obj.modifiers.new('weld', 'WELD')
            weld.merge_threshold = 0.0005
            bpy.ops.object.modifier_apply(modifier=weld.name)
            reduce = obj.modifiers.new('reduce', 'DECIMATE')
            reduce.ratio = ratio
            reduce.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=reduce.name)
for obj in all_meshes():
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

# ---- wheels: everything that turns, joined, with the origin in the wheel centre
wheel_names = []
for tyre_name in [o.name for o in all_meshes() if o.name.startswith('tyre')]:
    tyre = bpy.data.objects[tyre_name]
    hub = centre(tyre)
    parts = [
        o
        for o in all_meshes()
        if o is not tyre and WHEEL_PARTS.match(o.name) and (centre(o) - hub).length < 0.25
    ]
    side = ('F' if hub.y > 0 else 'R') + ('L' if hub.x < 0 else 'R')
    wheel = join([tyre, *parts], 'wheel_' + side)
    wheel.data.transform(Matrix.Translation(-hub))
    wheel.location = hub
    wheel_names.append(wheel.name)

body = join([o for o in all_meshes() if o.name not in wheel_names], 'body')
wheels = [bpy.data.objects[name] for name in wheel_names]

for obj in [body, *wheels]:
    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj]):
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception as error:  # the look only, never a reason to fail
            print('auto smooth skipped:', error)
        bpy.ops.object.material_slot_remove_unused()
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])

root = bpy.data.objects.new('XsaraPicasso', None)
bpy.context.scene.collection.objects.link(root)
for obj in [body, *wheels]:
    obj.parent = root

after = sum(tris(o) for o in [body, *wheels])
print(f'TRIS {before} -> {after}; wheels {wheel_names}')

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_yup=True,
    export_animations=False,
)
print('WROTE', OUT)

# ---- pictures to check the result by eye
if PREVIEW:
    scene = bpy.context.scene
    # Cycles on the processor: the only renderer that works without a screen everywhere.
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.render.resolution_x, scene.render.resolution_y = 1100, 700
    world = bpy.data.worlds.new('preview')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.9, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.2
    scene.world = world
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=40)
    camera = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = 55
    for name, position in {
        'front': (3.6, 5.6, 2.2),
        'rear': (-3.6, -5.6, 2.2),
        'side': (7.2, 0.0, 1.3),
    }.items():
        camera.location = position
        aim = Vector((0, 0, 0.7)) - camera.location
        camera.rotation_euler = aim.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{PREVIEW}/car-{name}.png'
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', scene.render.filepath)
