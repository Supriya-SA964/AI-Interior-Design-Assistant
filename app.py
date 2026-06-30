import os, json, time, base64, io
from flask import Flask, render_template, request, jsonify, url_for
from werkzeug.utils import secure_filename

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
gemini_client  = genai.Client(api_key=GEMINI_API_KEY)

app = Flask(__name__)
app.config['UPLOAD_FOLDER']      = 'static/uploads'
app.config['GENERATED_FOLDER']   = 'static/generated'
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
ALLOWED = {'png', 'jpg', 'jpeg', 'webp'}

def allowed(fn):
    return '.' in fn and fn.rsplit('.', 1)[1].lower() in ALLOWED

# ── YOLO lazy-load ────────────────────────────────────────────────
_yolo = None
def get_yolo():
    global _yolo
    if _yolo is None:
        try:
            from ultralytics import YOLO
            _yolo = YOLO("yolov8n.pt")
        except Exception as e:
            print(f"YOLO load failed: {e}")
            _yolo = False
    return _yolo

# ── BUG 3 FIX: ROOM-FURNITURE COMPATIBILITY MAP ───────────────────
# Defines which furniture is INCOMPATIBLE with each room type
ROOM_INCOMPATIBLE_FURNITURE = {
    "kitchen":  ["Bed", "Sofa", "Wardrobe", "TV Unit", "Coffee Table", "Bookshelf"],
    "bathroom": ["Bed", "Sofa", "Wardrobe", "TV Unit", "Coffee Table", "Bookshelf",
                 "Dining Table", "Study Table", "Office Chair"],
    "bedroom":  ["Dining Table"],
    "living":   ["Bed", "Wardrobe"],
    "dining":   ["Bed", "Wardrobe", "Sofa"],
    "office":   ["Bed", "Dining Table", "Sofa"],
}

# Suggested alternatives for incompatible furniture
FURNITURE_ALTERNATIVES = {
    "Bed":          "Try: Sofa, Armchair, or Bar Stool",
    "Sofa":         "Try: Dining Table, Kitchen Island, or Counter Stools",
    "Wardrobe":     "Try: Kitchen Cabinet or Pantry Shelf",
    "TV Unit":      "Try: Kitchen Shelf or Wall Cabinet",
    "Coffee Table": "Try: Kitchen Counter or Prep Table",
    "Bookshelf":    "Try: Spice Rack or Open Kitchen Shelf",
    "Dining Table": "Try: Bed, Study Table, or Dressing Table",
}

# Space size warning — items that are large and may not fit small rooms
LARGE_FURNITURE = ["Bed", "Sofa", "Wardrobe", "Dining Table", "TV Unit"]

# ── DATA TABLES ───────────────────────────────────────────────────
ITEM_COSTS = {
    "low":     {"sofa":15000,"bed":12000,"dining_table":8000,"tv_unit":6000,"study_table":4000,"office_chair":3000,"wardrobe":10000,"coffee_table":3000,"bookshelf":4000,"wall_paint":3500,"lighting":2000,"curtains":1500,"flooring":18000,"decor":2000},
    "medium":  {"sofa":35000,"bed":25000,"dining_table":18000,"tv_unit":14000,"study_table":9000,"office_chair":8000,"wardrobe":22000,"coffee_table":7000,"bookshelf":8000,"wall_paint":7000,"lighting":5000,"curtains":4000,"flooring":40000,"decor":5000},
    "premium": {"sofa":90000,"bed":65000,"dining_table":55000,"tv_unit":40000,"study_table":25000,"office_chair":30000,"wardrobe":60000,"coffee_table":22000,"bookshelf":20000,"wall_paint":15000,"lighting":18000,"curtains":12000,"flooring":90000,"decor":20000},
}

PRODUCT_LINKS = {
    "Wall Paints": [
        {"name":"Asian Paints","url":"https://www.asianpaints.com/colour-catalogue.html"},
        {"name":"Berger Paints","url":"https://www.bergerpaints.com/colourbank"},
    ],
    "Furniture": [
        {"name":"IKEA India","url":"https://www.ikea.com/in/en/"},
        {"name":"Pepperfry","url":"https://www.pepperfry.com/"},
        {"name":"Urban Ladder","url":"https://www.urbanladder.com/"},
    ],
    "Lighting": [
        {"name":"Philips","url":"https://www.lighting.philips.co.in/consumer"},
        {"name":"Havells","url":"https://www.havells.com/en/consumer/lighting.html"},
    ],
    "Decor & More": [
        {"name":"Home Centre","url":"https://www.homecentre.com/in/en/"},
        {"name":"D'Decor","url":"https://www.ddecor.com/"},
    ],
}

ROOM_CONFIGS = {
    "bedroom":  {"label":"Bedroom",      "icon":"🛏️","detected":{"Bed":1,"Window":1,"Door":1,"Wardrobe":1,"TV":0,"Chair":1,"Table":1,"Sofa":0}},
    "living":   {"label":"Living Room",  "icon":"🛋️","detected":{"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":1,"Chair":2,"Table":1,"Sofa":1}},
    "kitchen":  {"label":"Kitchen",      "icon":"🍳","detected":{"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":2,"Table":1,"Sofa":0}},
    "dining":   {"label":"Dining Hall",  "icon":"🍽️","detected":{"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":4,"Table":1,"Sofa":0}},
    "office":   {"label":"Office/Study", "icon":"💼","detected":{"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":1,"Table":1,"Sofa":0}},
    "bathroom": {"label":"Bathroom",     "icon":"🚿","detected":{"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":0,"Table":0,"Sofa":0}},
}

COLOR_MAP = {
    "bedroom":  {"low":{"wall_color":"Plain White","hex":"#F5F5F5","theme":"Basic & Clean","furniture":"Plywood & Plastic","lighting":"Ceiling Tube","decor":"None"},"medium":{"wall_color":"Calm Blue","hex":"#6B9FD4","theme":"Modern Minimal","furniture":"Solid Wood","lighting":"Warm LED","decor":"Plant, Wall Art"},"premium":{"wall_color":"Deep Teal","hex":"#2E6B6B","theme":"Luxury Modern","furniture":"Teak & Velvet","lighting":"Cove + Chandelier","decor":"Designer Art, Gold"}},
    "living":   {"low":{"wall_color":"Off White","hex":"#F0EDE8","theme":"Basic","furniture":"Basic Sofa","lighting":"Tube Light","decor":"None"},"medium":{"wall_color":"Sage Green","hex":"#7BAE7F","theme":"Contemporary","furniture":"Fabric Sofa & Wood","lighting":"LED + Lamp","decor":"Succulents, Art"},"premium":{"wall_color":"Charcoal","hex":"#3D4451","theme":"Ultra Luxury","furniture":"Italian Leather","lighting":"Chandelier","decor":"Marble, Gold"}},
    "kitchen":  {"low":{"wall_color":"Cream","hex":"#FFF8E7","theme":"Basic Functional","furniture":"Basic Laminate","lighting":"Tube Light","decor":"None"},"medium":{"wall_color":"Warm Beige","hex":"#C8A882","theme":"Modern Kitchen","furniture":"Modular Cabinets","lighting":"Under-Cabinet LED","decor":"Herb Pots"},"premium":{"wall_color":"Grey","hex":"#4A4A55","theme":"Premium Kitchen","furniture":"Italian Modular","lighting":"Recessed+Pendant","decor":"Marble Backsplash"}},
    "dining":   {"low":{"wall_color":"Off White","hex":"#F0EDE8","theme":"Simple","furniture":"Basic Wood","lighting":"Ceiling Light","decor":"None"},"medium":{"wall_color":"Terracotta","hex":"#C2714F","theme":"Warm Contemporary","furniture":"Solid Wood Set","lighting":"Pendant","decor":"Art, Rug"},"premium":{"wall_color":"Forest Green","hex":"#2D5A3D","theme":"Elegant","furniture":"Marble & Designer","lighting":"Chandelier","decor":"Gold, Art"}},
    "office":   {"low":{"wall_color":"Light Grey","hex":"#E8E8E8","theme":"Basic","furniture":"Basic Plywood","lighting":"Tube Light","decor":"None"},"medium":{"wall_color":"Dusty Blue","hex":"#6B8CAE","theme":"Productive","furniture":"Wood & Ergonomic","lighting":"LED Panel","decor":"Bookshelf, Plant"},"premium":{"wall_color":"Forest Green","hex":"#2D5A3D","theme":"Executive","furniture":"Premium Teak","lighting":"Cove + Lamp","decor":"Leather, Art"}},
    "bathroom": {"low":{"wall_color":"White","hex":"#F5F5F5","theme":"Clean & Basic","furniture":"Basic Ceramic","lighting":"Ceiling","decor":"None"},"medium":{"wall_color":"Light Marble","hex":"#E8DDD0","theme":"Modern Bath","furniture":"Vanity & Shower","lighting":"LED Mirror","decor":"Plants, Towels"},"premium":{"wall_color":"Dark Marble","hex":"#4A3F35","theme":"Spa Luxury","furniture":"Designer Fittings","lighting":"Backlit","decor":"Luxury Towels"}},
}

BUDGET_ITEMS = {
    "bedroom":  {"low":[{"name":"Wall Painting","cost":5000},{"name":"Basic Bed Frame","cost":8000},{"name":"Mattress","cost":6000},{"name":"Plywood Wardrobe","cost":7000},{"name":"Tube Light","cost":500},{"name":"Plain Curtains","cost":800}],"medium":[{"name":"Wall Painting","cost":9000},{"name":"Wooden Bed","cost":18000},{"name":"Wardrobe","cost":15000},{"name":"Study Table","cost":5000},{"name":"LED Lights","cost":3000},{"name":"Plant + Decor","cost":1800}],"premium":[{"name":"Designer Wall","cost":25000},{"name":"Upholstered Bed","cost":55000},{"name":"Luxury Wardrobe","cost":45000},{"name":"LED Cove","cost":12000},{"name":"Chandelier","cost":18000},{"name":"Decor Set","cost":12000}]},
    "living":   {"low":[{"name":"Wall Paint","cost":5000},{"name":"Basic Sofa","cost":12000},{"name":"Centre Table","cost":3000},{"name":"TV Unit","cost":4000},{"name":"Tube Light","cost":600},{"name":"Curtains","cost":1000}],"medium":[{"name":"Wall Paint","cost":9000},{"name":"Fabric Sofa","cost":25000},{"name":"Coffee Table","cost":7000},{"name":"TV Unit","cost":10000},{"name":"LED Lights","cost":3500},{"name":"Decor","cost":2000}],"premium":[{"name":"Feature Wall","cost":22000},{"name":"Leather Sofa","cost":65000},{"name":"Marble Table","cost":20000},{"name":"TV Unit","cost":18000},{"name":"Chandelier","cost":20000},{"name":"Designer Rug","cost":12000}]},
    "kitchen":  {"low":[{"name":"Wall Paint","cost":4000},{"name":"Basic Cabinets","cost":15000},{"name":"Laminate Counter","cost":5000},{"name":"Tube Light","cost":500},{"name":"Sink","cost":2000}],"medium":[{"name":"Kitchen Tiles","cost":12000},{"name":"Modular Cabinets","cost":35000},{"name":"Granite Counter","cost":10000},{"name":"LED Lights","cost":4000},{"name":"Chimney","cost":8000}],"premium":[{"name":"Italian Tile","cost":30000},{"name":"Premium Kitchen","cost":90000},{"name":"Marble Counter","cost":25000},{"name":"Recessed Lights","cost":12000},{"name":"Appliances","cost":40000}]},
    "dining":   {"low":[{"name":"Wall Paint","cost":4500},{"name":"Dining Table","cost":8000},{"name":"Chairs x4","cost":4000},{"name":"Tube Light","cost":500},{"name":"Curtain","cost":900}],"medium":[{"name":"Wall Paint","cost":8000},{"name":"Wooden Dining Set","cost":22000},{"name":"Pendant Light","cost":5000},{"name":"Sideboard","cost":8000},{"name":"Wall Art","cost":3000}],"premium":[{"name":"Feature Wall","cost":20000},{"name":"Marble Table","cost":55000},{"name":"Designer Chairs","cost":30000},{"name":"Chandelier","cost":25000},{"name":"Decor Set","cost":10000}]},
    "office":   {"low":[{"name":"Wall Paint","cost":3000},{"name":"Basic Desk","cost":4000},{"name":"Basic Chair","cost":2500},{"name":"Tube Light","cost":500},{"name":"Shelf","cost":1500}],"medium":[{"name":"Wall Paint","cost":7000},{"name":"Work Desk","cost":12000},{"name":"Ergonomic Chair","cost":8000},{"name":"LED Panel","cost":3000},{"name":"Bookshelf","cost":6000}],"premium":[{"name":"Feature Wall","cost":18000},{"name":"Executive Desk","cost":35000},{"name":"Premium Chair","cost":25000},{"name":"Cove Lighting","cost":10000},{"name":"Custom Shelving","cost":20000}]},
    "bathroom": {"low":[{"name":"Wall Tiles","cost":8000},{"name":"Basic Vanity","cost":5000},{"name":"Fittings","cost":4000},{"name":"Light","cost":500},{"name":"Mirror","cost":1500}],"medium":[{"name":"Designer Tiles","cost":18000},{"name":"Vanity+Sink","cost":12000},{"name":"Shower","cost":10000},{"name":"LED Mirror","cost":6000},{"name":"Fittings","cost":8000}],"premium":[{"name":"Marble Tiles","cost":45000},{"name":"Designer Vanity","cost":30000},{"name":"Bathtub","cost":40000},{"name":"Backlit Mirror","cost":15000},{"name":"Luxury Fittings","cost":25000}]},
}

# ── YOLO DETECTION ────────────────────────────────────────────────
def run_yolo(image_path):
    model = get_yolo()
    if not model:
        return {}, None
    try:
        import cv2
        img     = cv2.imread(image_path)
        results = model(img, conf=0.3, verbose=False)
        labels  = []
        for r in results:
            for c in r.boxes.cls:
                labels.append(model.names[int(c)])
        counts = {}
        for l in labels:
            counts[l] = counts.get(l, 0) + 1
        ls = set(l.lower() for l in labels)
        if   any(x in ls for x in ['bed','pillow','mattress']):          room = 'bedroom'
        elif any(x in ls for x in ['oven','refrigerator','microwave']):  room = 'kitchen'
        elif any(x in ls for x in ['dining table','fork']):              room = 'dining'
        elif any(x in ls for x in ['sofa','tv','couch']):                room = 'living'
        elif any(x in ls for x in ['laptop','keyboard','monitor']):      room = 'office'
        elif any(x in ls for x in ['toilet','sink','bathtub']):          room = 'bathroom'
        else:                                                             room = None
        return counts, room
    except Exception as e:
        print(f"YOLO error: {e}")
        return {}, None


# ═══════════════════════════════════════════════════════════════════
# BUG 1 FIX — GEMINI IMAGE EDITING
# Uses a much stronger prompt that forces the model to keep the
# EXACT same room structure, walls, windows, doors, and floor plan.
# ═══════════════════════════════════════════════════════════════════
def generate_redesign_with_gemini(image_path, room_type_key, budget_key, design_state=None):
    import PIL.Image as PILImage

    config     = ROOM_CONFIGS[room_type_key]
    color_info = COLOR_MAP[room_type_key][budget_key]

    wall_color = color_info['wall_color']
    furniture  = color_info['furniture']
    lighting   = color_info['lighting']
    decor      = color_info['decor']
    theme      = color_info['theme']
    flooring   = ''
    curtains   = ''

    if design_state:
        if design_state.get('wall_color'):    wall_color = design_state['wall_color']
        if design_state.get('furniture'):     furniture  = design_state['furniture']
        if design_state.get('lighting'):      lighting   = design_state['lighting']
        if design_state.get('decor'):         decor      = design_state['decor']
        if design_state.get('theme'):         theme      = design_state['theme']
        if design_state.get('flooring'):      flooring   = design_state['flooring']
        if design_state.get('curtains'):      curtains   = design_state['curtains']
        if design_state.get('decorations') and len(design_state['decorations']) > 0:
            decor = ', '.join(design_state['decorations'])

    # Step 1: Analyse the room with Gemini Vision
    pil_img = PILImage.open(image_path)

    # BUG 1 FIX: Much more detailed analysis to capture exact room geometry
    analysis_prompt = f"""Analyse this room photo very carefully and respond ONLY with valid JSON (no markdown):
{{
  "room_observations": "describe the current room in one sentence",
  "window_wall": "left/right/back/front",
  "window_count": 1,
  "window_size": "small/medium/large",
  "door_wall": "left/right/back/front",
  "door_count": 1,
  "camera_angle": "corner/straight/wide",
  "room_size": "small/medium/large",
  "ceiling_height": "low/standard/high",
  "floor_material": "tile/wood/marble/concrete",
  "wall_count_visible": 2,
  "room_shape": "rectangular/square/L-shaped",
  "wall_color": "{wall_color}",
  "wall_color_hex": "{color_info['hex']}",
  "theme": "{theme}",
  "furniture_style": "{furniture}",
  "lighting": "{lighting}",
  "decor": "{decor}"
}}"""

    analysis_data = {}
    try:
        resp = gemini_client.models.generate_content(
            model="gemini-1.5-flash",
            contents=[analysis_prompt, pil_img],
        )
        raw = resp.text.strip()
        if "```" in raw:
            for part in raw.split("```"):
                part = part.strip()
                if part.startswith("json"): part = part[4:].strip()
                if part.startswith("{"): raw = part; break
        analysis_data = json.loads(raw)
    except Exception as e:
        print(f"Analysis error: {e}")
        analysis_data = {
            "room_observations": "Room ready for redesign",
            "window_wall": "back", "door_wall": "left",
            "camera_angle": "corner", "room_size": "medium",
            "ceiling_height": "standard", "floor_material": "tile",
            "room_shape": "rectangular", "window_count": 1,
            "wall_color": wall_color, "wall_color_hex": color_info['hex'],
            "theme": theme, "furniture_style": furniture,
            "lighting": lighting, "decor": decor,
        }

    window_wall   = analysis_data.get('window_wall', 'back')
    door_wall     = analysis_data.get('door_wall', 'left')
    camera_angle  = analysis_data.get('camera_angle', 'corner')
    room_size     = analysis_data.get('room_size', 'medium')
    ceiling_h     = analysis_data.get('ceiling_height', 'standard')
    floor_mat     = analysis_data.get('floor_material', 'tile')
    room_shape    = analysis_data.get('room_shape', 'rectangular')
    window_count  = analysis_data.get('window_count', 1)

    flooring_txt  = f", {flooring} flooring" if flooring else f", keep existing {floor_mat} flooring"
    curtains_txt  = f", {curtains} curtains on windows" if curtains else ""

    # BUG 1 FIX: Ultra-strict edit instruction — forces SAME room
    edit_instruction = f"""You are a professional interior designer photo editor.
Your ONLY task: REDESIGN THIS EXACT ROOM PHOTO with new decor. DO NOT create a new room.

═══ ABSOLUTE STRUCTURAL RULES — NEVER CHANGE THESE ═══
✦ SAME exact walls — same {room_shape} shape, same {room_size} dimensions
✦ SAME exact window position — window on the {window_wall} wall, {window_count} window(s), same size
✦ SAME exact door position — door on the {door_wall} wall, same size
✦ SAME exact camera viewpoint — {camera_angle} angle, same height, same focal length
✦ SAME {ceiling_h} ceiling height
✦ SAME room proportions — do NOT stretch, crop or zoom differently
✦ This is a {config['label']} — keep it as a {config['label']}

═══ APPLY THESE DESIGN CHANGES ONLY ═══
• Wall color: Paint all visible walls {wall_color}
• Furniture: Add {furniture} appropriate for a {config['label']}
• Lighting: {lighting}
• Decorations: {decor}{curtains_txt}
• Flooring: {flooring_txt}
• Style: {theme} interior design
• Budget: {budget_key} — {"simple basic materials" if budget_key=="low" else "modern quality materials" if budget_key=="medium" else "luxury premium materials"}

Output: photorealistic redesigned photo of THIS SAME room. Professional interior magazine quality. 8K sharp."""

    # Step 2: Try Gemini image editing
    generated_path = None
    try:
        edit_response = gemini_client.models.generate_content(
            model="gemini-2.0-flash-exp-image-generation",
            contents=[
                types.Part.from_bytes(
                    data=open(image_path, 'rb').read(),
                    mime_type=_get_mime(image_path),
                ),
                edit_instruction,
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        for part in edit_response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                img_data = part.inline_data.data
                os.makedirs(
                    os.path.join(app.root_path, app.config['GENERATED_FOLDER']),
                    exist_ok=True
                )
                gen_filename = f"gen_{int(time.time())}_{room_type_key}.png"
                gen_path     = os.path.join(
                    app.root_path, app.config['GENERATED_FOLDER'], gen_filename
                )
                with open(gen_path, 'wb') as f:
                    f.write(img_data if isinstance(img_data, bytes) else base64.b64decode(img_data))
                generated_path = gen_filename
                print(f"Gemini image generation SUCCESS: {gen_filename}")
                break

    except Exception as e:
        print(f"Gemini image generation failed: {e}")
        generated_path = None

    return generated_path, analysis_data


def _get_mime(image_path):
    ext = image_path.rsplit('.', 1)[-1].lower()
    return {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}.get(ext, "image/jpeg")


# ═══════════════════════════════════════════════════════════════════
# BUG 2 FIX — RELIABLE POLLINATIONS FALLBACK
# When Gemini is unavailable, use a rock-solid Pollinations URL
# with much better room-anchoring and a working retry mechanism.
# ═══════════════════════════════════════════════════════════════════
def build_room_anchored_url(image_path, room_type_key, budget_key,
                             window_wall, door_wall, camera_angle,
                             design_state, seed=None, room_size="medium",
                             ceiling_height="standard", floor_material="tile"):
    import urllib.parse

    if seed is None:
        seed = int(time.time()) % 999999

    config     = ROOM_CONFIGS[room_type_key]
    color_info = COLOR_MAP[room_type_key][budget_key]
    d          = design_state or {}

    wall_color = d.get('wall_color') or color_info['wall_color']
    furniture  = d.get('furniture')  or color_info['furniture']
    lighting   = d.get('lighting')   or color_info['lighting']
    decor_txt  = ', '.join(d['decorations']) if d.get('decorations') else (d.get('decor') or color_info['decor'])
    theme      = d.get('theme')      or color_info['theme']
    flooring   = d.get('flooring', '') or floor_material
    curtains   = d.get('curtains', '')

    budget_desc = {
        'low':     'simple affordable materials basic finishes',
        'medium':  'modern stylish quality materials mid-range finishes',
        'premium': 'luxury designer high-end premium finishes',
    }.get(budget_key, 'modern finishes')

    # BUG 2 FIX: More precise prompt with negative keywords to stop model drift
    prompt_parts = [
        f"photorealistic interior photo of a {config['label'].lower()}",
        f"{room_size} sized room {camera_angle} view",
        f"window on {window_wall} wall",
        f"door on {door_wall} wall",
        f"walls painted {wall_color}",
        f"{furniture} furniture",
        f"{lighting} lighting",
        f"{flooring} floor",
    ]
    if curtains:   prompt_parts.append(f"{curtains} window curtains")
    if decor_txt:  prompt_parts.append(f"{decor_txt}")
    prompt_parts += [
        f"{theme} interior design style",
        budget_desc,
        "8K ultra detailed sharp professional interior photography",
        "correct proportions architectural accuracy",
        "magazine quality",
    ]

    full_prompt = ", ".join(prompt_parts)
    if len(full_prompt) > 490:
        full_prompt = full_prompt[:487] + "..."

    encoded  = urllib.parse.quote(full_prompt)
    # BUG 2 FIX: Two different seeds so both URLs load different images (not the same)
    primary  = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=768&model=flux&nologo=true&seed={seed}&enhance=true"
    fallback = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=768&model=flux-realism&nologo=true&seed={seed+7}"
    return primary, fallback


# ── BUG 3 FIX: FURNITURE COMPATIBILITY CHECK ROUTE ───────────────
@app.route('/check_compatibility', methods=['POST'])
def check_compatibility():
    """
    Returns whether a furniture item is compatible with the current room type,
    including size warnings for large items in small rooms.
    """
    body          = request.get_json()
    room_type_key = body.get('room_type', 'bedroom')
    furniture     = body.get('furniture', '')
    room_size     = body.get('room_size', 'medium')   # from prior analysis

    incompatible_list = ROOM_INCOMPATIBLE_FURNITURE.get(room_type_key, [])
    room_label        = ROOM_CONFIGS.get(room_type_key, {}).get('label', room_type_key)

    # Check incompatibility
    is_incompatible = any(f.lower() == furniture.lower() for f in incompatible_list)
    if is_incompatible:
        alt = FURNITURE_ALTERNATIVES.get(furniture, "Choose a room-appropriate piece")
        return jsonify({
            'compatible':    False,
            'warning_type':  'incompatible',
            'message':       f"⚠️ {furniture} doesn't belong in a {room_label}!",
            'detail':        f"A {furniture} is not suitable for {room_label} spaces. {alt}",
            'suggestion':    alt,
        })

    # Check size warning
    size_warning = False
    size_message = ''
    if room_size == 'small' and furniture in LARGE_FURNITURE:
        size_warning = True
        size_message = (
            f"📐 Size Warning: A {furniture} may be too large for this small room. "
            f"It could occupy most of the available floor space. "
            f"Consider a compact alternative or ensure the room is at least 120 sq ft."
        )

    return jsonify({
        'compatible':   True,
        'size_warning': size_warning,
        'message':      size_message if size_warning else f"✅ {furniture} works well in a {room_label}.",
        'warning_type': 'size' if size_warning else 'none',
    })


# ── ROUTES ────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze_route():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    f = request.files['image']
    if not f.filename or not allowed(f.filename):
        return jsonify({'error': 'Use JPG, PNG or WEBP'}), 400

    budget_key    = request.form.get('budget', 'medium')
    room_type_key = request.form.get('room_type', 'bedroom')
    if budget_key    not in ITEM_COSTS:   budget_key    = 'medium'
    if room_type_key not in ROOM_CONFIGS: room_type_key = 'bedroom'

    nm, ext = os.path.splitext(secure_filename(f.filename))
    fn      = f"{nm}_{int(time.time())}{ext}"
    up      = os.path.join(app.root_path, app.config['UPLOAD_FOLDER'])
    os.makedirs(up, exist_ok=True)
    fp      = os.path.join(up, fn)
    f.save(fp)
    image_url = url_for('static', filename=f'uploads/{fn}')

    # YOLO detect
    detected_items, yolo_room = run_yolo(fp)
    if not detected_items:
        detected_items = ROOM_CONFIGS[room_type_key]['detected']
    if yolo_room:
        room_type_key = yolo_room

    # Generate redesigned image
    gen_filename, analysis_data = generate_redesign_with_gemini(fp, room_type_key, budget_key)

    window_wall   = analysis_data.get('window_wall', 'back')
    door_wall     = analysis_data.get('door_wall', 'left')
    camera_angle  = analysis_data.get('camera_angle', 'corner')
    room_size     = analysis_data.get('room_size', 'medium')
    ceiling_h     = analysis_data.get('ceiling_height', 'standard')
    floor_mat     = analysis_data.get('floor_material', 'tile')

    if gen_filename:
        after_image_url      = url_for('static', filename=f'generated/{gen_filename}')
        after_image_fallback = ''
        image_mode           = 'gemini'
    else:
        seed = int(time.time()) % 999999
        primary, fallback = build_room_anchored_url(
            fp, room_type_key, budget_key,
            window_wall, door_wall, camera_angle, {},
            seed, room_size, ceiling_h, floor_mat
        )
        after_image_url      = primary
        after_image_fallback = fallback
        image_mode           = 'pollinations'

    budget_items = BUDGET_ITEMS[room_type_key][budget_key]
    total_cost   = sum(i['cost'] for i in budget_items)

    return jsonify({
        'success':              True,
        'image_url':            image_url,
        'filename':             fn,
        'room_type':            room_type_key,
        'room_label':           ROOM_CONFIGS[room_type_key]['label'],
        'room_icon':            ROOM_CONFIGS[room_type_key]['icon'],
        'room_observations':    analysis_data.get('room_observations', ''),
        'window_wall':          window_wall,
        'door_wall':            door_wall,
        'camera_angle':         camera_angle,
        'room_size':            room_size,
        'ceiling_height':       ceiling_h,
        'floor_material':       floor_mat,
        'detected_items':       detected_items,
        'wall_color':           analysis_data.get('wall_color', ''),
        'wall_color_hex':       analysis_data.get('wall_color_hex', '#6B9FD4'),
        'theme':                analysis_data.get('theme', ''),
        'furniture_style':      analysis_data.get('furniture_style', ''),
        'lighting':             analysis_data.get('lighting', ''),
        'decor':                analysis_data.get('decor', ''),
        'after_image_url':      after_image_url,
        'after_image_fallback': after_image_fallback,
        'image_mode':           image_mode,
        'budget_tier':          budget_key,
        'budget_items':         budget_items,
        'budget_total':         total_cost,
        'budget_low_min':       25000, 'budget_low_max':  35000,
        'budget_mid_min':       35000, 'budget_mid_max':  60000,
        'budget_prem_min':      60000,
        'product_links':        PRODUCT_LINKS,
    })


@app.route('/regenerate', methods=['POST'])
def regenerate_route():
    body          = request.get_json()
    filename      = body.get('filename', '')
    budget_key    = body.get('budget', 'medium')
    room_type_key = body.get('room_type', 'bedroom')
    design_state  = body.get('design_state', {})
    window_wall   = body.get('window_wall', 'back')
    door_wall     = body.get('door_wall', 'left')
    camera_angle  = body.get('camera_angle', 'corner')
    room_size     = body.get('room_size', 'medium')
    ceiling_h     = body.get('ceiling_height', 'standard')
    floor_mat     = body.get('floor_material', 'tile')

    if budget_key    not in ITEM_COSTS:   budget_key    = 'medium'
    if room_type_key not in ROOM_CONFIGS: room_type_key = 'bedroom'

    image_path = os.path.join(app.root_path, app.config['UPLOAD_FOLDER'], filename)

    gen_filename  = None
    analysis_data = None

    if os.path.exists(image_path):
        gen_filename, analysis_data = generate_redesign_with_gemini(
            image_path, room_type_key, budget_key, design_state
        )
        if analysis_data:
            window_wall  = analysis_data.get('window_wall', window_wall)
            door_wall    = analysis_data.get('door_wall', door_wall)
            camera_angle = analysis_data.get('camera_angle', camera_angle)
            room_size    = analysis_data.get('room_size', room_size)
            ceiling_h    = analysis_data.get('ceiling_height', ceiling_h)
            floor_mat    = analysis_data.get('floor_material', floor_mat)

    if gen_filename:
        after_image_url      = url_for('static', filename=f'generated/{gen_filename}')
        after_image_fallback = ''
        image_mode           = 'gemini'
    else:
        # BUG 2 FIX: always generate a fresh seed on regenerate
        seed = int(time.time()) % 999999
        primary, fallback = build_room_anchored_url(
            image_path if os.path.exists(image_path) else '',
            room_type_key, budget_key,
            window_wall, door_wall, camera_angle,
            design_state, seed, room_size, ceiling_h, floor_mat
        )
        after_image_url      = primary
        after_image_fallback = fallback
        image_mode           = 'pollinations'

    budget_items = BUDGET_ITEMS[room_type_key][budget_key]
    total_cost   = sum(i['cost'] for i in budget_items)

    return jsonify({
        'success':              True,
        'after_image_url':      after_image_url,
        'after_image_fallback': after_image_fallback,
        'image_mode':           image_mode,
        'budget_items':         budget_items,
        'budget_total':         total_cost,
        'analysis':             analysis_data,
        # Return updated room geometry for JS state
        'window_wall':          window_wall,
        'door_wall':            door_wall,
        'camera_angle':         camera_angle,
        'room_size':            room_size,
        'ceiling_height':       ceiling_h,
        'floor_material':       floor_mat,
    })


if __name__ == '__main__':
    os.makedirs('static/uploads',   exist_ok=True)
    os.makedirs('static/generated', exist_ok=True)
    app.run(debug=True, port=5000) 