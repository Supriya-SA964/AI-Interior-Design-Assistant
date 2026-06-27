import os, json, time, base64
from flask import Flask, render_template, request, jsonify, url_for
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
ALLOWED = {'png', 'jpg', 'jpeg', 'webp'}

def allowed(fn):
    return '.' in fn and fn.rsplit('.', 1)[1].lower() in ALLOWED


# ─────────────────────────────────────────────────────────────────
#  BUDGET STYLES
# ─────────────────────────────────────────────────────────────────
BUDGET_STYLES = {
    "low": {
        "label":         "Low Budget",
        "material":      "plywood furniture, plastic chairs, flat white wall paint, basic laminate flooring",
        "lighting":      "single fluorescent tube light on ceiling, no ambient or accent lighting",
        "decor":         "no decorative items, bare walls, simple plain curtains",
        "atmosphere":    "minimal basic economy interior, budget Indian home",
        "quality_words": "basic affordable simple economy budget",
    },
    "medium": {
        "label":         "Medium Budget",
        "material":      "solid wood furniture, fabric upholstery, textured wall paint, vitrified tile flooring",
        "lighting":      "warm LED ceiling panel, bedside table lamps, soft ambient glow",
        "decor":         "one indoor plant, framed wall art, simple curtains with valance",
        "atmosphere":    "modern comfortable Indian home interior, well-designed mid-range",
        "quality_words": "modern balanced comfortable mid-range tasteful",
    },
    "high": {
        "label":         "High Budget",
        "material":      "Italian marble flooring, teak wood and velvet furniture, leather accents, gold hardware",
        "lighting":      "hidden LED cove lighting on ceiling, crystal chandelier, warm accent spotlights",
        "decor":         "designer art pieces, silk curtains, gold vase, luxury indoor plant in ceramic pot",
        "atmosphere":    "ultra luxury premium Indian home, architect-designed opulent space",
        "quality_words": "luxury premium opulent ultra high-end designer sophisticated",
    },
}

# ─────────────────────────────────────────────────────────────────
#  ROOM PROFILES
# ─────────────────────────────────────────────────────────────────
ROOM_PROFILES = {
    "bedroom": {
        "room_type": "Bedroom",
        "detected":  {"Bed":1,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":0,"Table":0,"Sofa":0},
        "objects":   "bed against the back wall, two bedside tables, wardrobe on side wall",
        "budget_items_low":    [{"name":"Wall Painting","cost":5000},{"name":"Basic Bed Frame","cost":8000},{"name":"Mattress","cost":6000},{"name":"Plywood Wardrobe","cost":7000},{"name":"Tube Light","cost":500},{"name":"Plain Curtains","cost":800}],
        "budget_items_medium": [{"name":"Wall Painting","cost":9000},{"name":"Wooden Bed","cost":18000},{"name":"Wardrobe","cost":15000},{"name":"Study Table","cost":5000},{"name":"LED Lights","cost":3000},{"name":"Indoor Plant","cost":800}],
        "budget_items_high":   [{"name":"Designer Wall Treatment","cost":25000},{"name":"Premium Upholstered Bed","cost":55000},{"name":"Luxury Wardrobe","cost":45000},{"name":"LED Cove Lighting","cost":12000},{"name":"Crystal Chandelier","cost":18000},{"name":"Designer Decor Set","cost":8000}],
    },
    "living": {
        "room_type": "Living Room",
        "detected":  {"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":1,"Chair":2,"Table":1,"Sofa":1},
        "objects":   "sofa set facing TV wall, centre coffee table, TV unit on opposite wall",
        "budget_items_low":    [{"name":"Wall Paint","cost":5000},{"name":"Basic Sofa","cost":12000},{"name":"Centre Table","cost":3000},{"name":"TV Unit","cost":4000},{"name":"Tube Light","cost":600},{"name":"Basic Curtain","cost":1000}],
        "budget_items_medium": [{"name":"Wall Paint","cost":9000},{"name":"Fabric Sofa Set","cost":25000},{"name":"Wooden Coffee Table","cost":7000},{"name":"TV Unit","cost":10000},{"name":"LED Lights","cost":3500},{"name":"Indoor Plant","cost":900}],
        "budget_items_high":   [{"name":"Designer Wall Panel","cost":22000},{"name":"Italian Leather Sofa","cost":65000},{"name":"Marble Coffee Table","cost":20000},{"name":"Premium TV Unit","cost":18000},{"name":"Chandelier","cost":20000},{"name":"Designer Rug","cost":12000}],
    },
    "kitchen": {
        "room_type": "Kitchen",
        "detected":  {"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":2,"Table":1,"Sofa":0},
        "objects":   "modular kitchen cabinets along walls, counter top, sink near window",
        "budget_items_low":    [{"name":"Wall Paint","cost":4000},{"name":"Basic Cabinets","cost":15000},{"name":"Counter Top","cost":5000},{"name":"Tube Light","cost":500},{"name":"Basic Sink","cost":2000},{"name":"Storage Rack","cost":1500}],
        "budget_items_medium": [{"name":"Tile Work","cost":12000},{"name":"Modular Cabinets","cost":35000},{"name":"Granite Counter","cost":10000},{"name":"LED Lights","cost":4000},{"name":"Steel Sink","cost":5000},{"name":"Chimney","cost":8000}],
        "budget_items_high":   [{"name":"Italian Tile","cost":30000},{"name":"Premium Modular Kitchen","cost":90000},{"name":"Marble Counter","cost":25000},{"name":"Designer Lighting","cost":12000},{"name":"Premium Sink","cost":15000},{"name":"Built-in Appliances","cost":40000}],
    },
    "office": {
        "room_type": "Home Office",
        "detected":  {"Bed":0,"Window":1,"Door":1,"Wardrobe":0,"TV":0,"Chair":1,"Table":1,"Sofa":0},
        "objects":   "work desk facing wall, ergonomic chair, bookshelf on side",
        "budget_items_low":    [{"name":"Wall Paint","cost":3000},{"name":"Basic Desk","cost":4000},{"name":"Basic Chair","cost":2500},{"name":"Tube Light","cost":500},{"name":"Basic Shelf","cost":1500},{"name":"Storage Box","cost":800}],
        "budget_items_medium": [{"name":"Wall Paint","cost":7000},{"name":"Wooden Work Desk","cost":12000},{"name":"Ergonomic Chair","cost":8000},{"name":"LED Panel Light","cost":3000},{"name":"Bookshelf","cost":6000},{"name":"Indoor Plant","cost":700}],
        "budget_items_high":   [{"name":"Designer Wall","cost":18000},{"name":"Premium Executive Desk","cost":35000},{"name":"Executive Chair","cost":25000},{"name":"Cove Lighting","cost":10000},{"name":"Custom Shelving","cost":20000},{"name":"Designer Decor","cost":8000}],
    },
}

COLOR_MAP = {
    "bedroom": {
        "low":    {"wall_color":"Plain White",    "hex":"#F5F5F5","theme":"Basic",           "furniture":"Plywood & Plastic",  "lighting":"Tube Light",        "decor":"None"},
        "medium": {"wall_color":"Calm Blue",       "hex":"#6B9FD4","theme":"Modern Minimal", "furniture":"Wooden & Neutral",   "lighting":"Warm LED",          "decor":"Indoor Plant, Wall Art"},
        "high":   {"wall_color":"Deep Teal",       "hex":"#2E6B6B","theme":"Luxury Modern",  "furniture":"Teak & Velvet",      "lighting":"Cove + Chandelier", "decor":"Designer Art, Gold"},
    },
    "living": {
        "low":    {"wall_color":"Off White",       "hex":"#F0EDE8","theme":"Basic",           "furniture":"Plastic & Basic",   "lighting":"Tube Light",        "decor":"None"},
        "medium": {"wall_color":"Sage Green",      "hex":"#7BAE7F","theme":"Contemporary",   "furniture":"Fabric Sofa & Wood", "lighting":"LED + Floor Lamp",  "decor":"Succulents, Art"},
        "high":   {"wall_color":"Charcoal",        "hex":"#3D4451","theme":"Ultra Luxury",   "furniture":"Italian Leather",    "lighting":"Chandelier + Cove", "decor":"Marble, Gold Frames"},
    },
    "kitchen": {
        "low":    {"wall_color":"Cream",           "hex":"#FFF8E7","theme":"Basic",           "furniture":"Basic Laminate",    "lighting":"Tube Light",        "decor":"None"},
        "medium": {"wall_color":"Warm Beige",      "hex":"#C8A882","theme":"Modern Kitchen",  "furniture":"Modular Cabinets",  "lighting":"Under-Cabinet LED", "decor":"Herb Pots"},
        "high":   {"wall_color":"Midnight Grey",   "hex":"#4A4A55","theme":"Premium Kitchen", "furniture":"Italian Modular",   "lighting":"Recessed+Pendant",  "decor":"Marble Backsplash"},
    },
    "office": {
        "low":    {"wall_color":"Light Grey",      "hex":"#E8E8E8","theme":"Basic",           "furniture":"Basic Plywood",     "lighting":"Tube Light",        "decor":"None"},
        "medium": {"wall_color":"Dusty Blue",      "hex":"#6B8CAE","theme":"Productive",      "furniture":"Wood & Ergonomic",  "lighting":"LED Panel",         "decor":"Bookshelf, Plant"},
        "high":   {"wall_color":"Forest Green",    "hex":"#2D5A3D","theme":"Executive",       "furniture":"Premium Teak",      "lighting":"Cove + Desk Lamp",  "decor":"Leather, Art"},
    },
}

def detect_room(filename):
    fl = filename.lower()
    if any(w in fl for w in ['bed','sleep','bedroom']): return "bedroom"
    if any(w in fl for w in ['living','lounge','sofa']): return "living"
    if any(w in fl for w in ['kitchen','cook','dining']): return "kitchen"
    if any(w in fl for w in ['office','work','desk','study']): return "office"
    return "bedroom"


# ─────────────────────────────────────────────────────────────────
#  BUILD PROMPT — KEY FIX: preserve EXACT room structure
# ─────────────────────────────────────────────────────────────────
def build_image_prompt(room_key, budget_key, color_info, filename):
    profile = ROOM_PROFILES[room_key]
    bstyle  = BUDGET_STYLES[budget_key]
    room_lbl = profile["room_type"]

    # Describe what we know about the input room structure
    # so Pollinations preserves it
    prompt = (
        # ── STRUCTURE PRESERVATION (most important — put first) ──
        f"interior redesign of a {room_lbl.lower()}, "
        f"EXACTLY preserve the original room structure: "
        f"same rectangular room shape, "
        f"KEEP window on the SAME wall and SAME position as original photo, "
        f"KEEP door on the SAME wall and SAME position as original photo, "
        f"SAME camera viewpoint and angle as original, "
        f"SAME floor plan layout, "
        f"DO NOT move or add windows or doors, "

        # ── BUDGET-DRIVEN CHANGES (only furniture/decor/color) ──
        f"only change: wall color to {color_info['wall_color'].lower()}, "
        f"add {bstyle['material']}, "
        f"lighting: {bstyle['lighting']}, "
        f"decor: {bstyle['decor']}, "
        f"{bstyle['atmosphere']}, "

        # ── QUALITY ──
        f"{bstyle['quality_words']} interior design, "
        f"photorealistic architectural photography, "
        f"8K ultra detailed, correct perspective, "
        f"natural daylight entering from window on correct wall, "
        f"no distorted furniture, no floating objects, "
        f"professional interior design magazine quality"
    )
    return prompt


def analyze_room_locally(filename, budget_key="medium"):
    room_key   = detect_room(filename)
    profile    = ROOM_PROFILES[room_key]
    color_info = COLOR_MAP[room_key][budget_key]
    bstyle     = BUDGET_STYLES[budget_key]

    budget_items = profile[f"budget_items_{budget_key}"]
    image_prompt = build_image_prompt(room_key, budget_key, color_info, filename)

    return {
        "room_type":          profile["room_type"],
        "detected_items":     profile["detected"],
        "wall_color":         color_info["wall_color"],
        "wall_color_hex":     color_info["hex"],
        "theme":              color_info["theme"],
        "furniture_style":    color_info["furniture"],
        "lighting":           color_info["lighting"],
        "decor":              color_info["decor"],
        "budget_tier":        budget_key,
        "budget_label":       bstyle["label"],
        "image_prompt":       image_prompt,
        "budget_items":       budget_items,
        "budget_low_min":     25000, "budget_low_max":     35000,
        "budget_mid_min":     35000, "budget_mid_max":     60000,
        "budget_premium_min": 60000,
    }


# ─────────────────────────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze_route():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    f = request.files['image']
    if not f.filename or not allowed(f.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    budget_key = request.form.get('budget', 'medium').lower()
    if budget_key not in BUDGET_STYLES:
        budget_key = 'medium'

    nm, ext = os.path.splitext(secure_filename(f.filename))
    fn = f"{nm}_{int(time.time())}{ext}"
    up = os.path.join(app.root_path, app.config['UPLOAD_FOLDER'])
    os.makedirs(up, exist_ok=True)
    fp = os.path.join(up, fn)
    f.save(fp)

    try:
        data = analyze_room_locally(fn, budget_key)
        data['image_url']    = url_for('static', filename=f'uploads/{fn}')
        data['budget_total'] = sum(i['cost'] for i in data.get('budget_items', []))
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── NEW: re-analyse with different budget (image already saved) ──
@app.route('/reanalyze', methods=['POST'])
def reanalyze_route():
    """Called when user switches budget tier on dashboard — no re-upload needed."""
    body       = request.get_json()
    filename   = body.get('filename', '')
    budget_key = body.get('budget', 'medium').lower()
    image_url  = body.get('image_url', '')

    if budget_key not in BUDGET_STYLES:
        budget_key = 'medium'

    try:
        data = analyze_room_locally(filename, budget_key)
        data['image_url']    = image_url          # keep original upload URL
        data['budget_total'] = sum(i['cost'] for i in data.get('budget_items', []))
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    os.makedirs('static/uploads', exist_ok=True)
    app.run(debug=True, port=5000)