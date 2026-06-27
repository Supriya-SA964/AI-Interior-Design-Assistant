# RoomAI — AI Interior Design Assistant

A production-quality Flask web application that uses Claude AI vision to analyse room photos and deliver complete interior design recommendations.

---

## Project Structure

```
interior-ai/
├── app.py                  # Flask backend + AI analysis logic
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Full single-page UI
├── static/
│   ├── css/
│   │   └── style.css       # Complete stylesheet
│   ├── js/
│   │   └── app.js          # Frontend logic
│   └── uploads/            # Auto-created on first run
└── README.md
```

---

## Setup Instructions

### Step 1 — Clone / navigate to the folder
```bash
cd interior-ai
```

### Step 2 — Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows
```

### Step 3 — Install dependencies
```bash
pip install -r requirements.txt
```

### Step 4 — Set your Anthropic API key
```bash
# macOS / Linux
export ANTHROPIC_API_KEY="sk-ant-..."

# Windows CMD
set ANTHROPIC_API_KEY=sk-ant-...

# Windows PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-..."
```

Get your key at: https://console.anthropic.com/

### Step 5 — Run the application
```bash
python app.py
```

Open your browser at: **http://localhost:5000**

---

## Features

| Feature | Details |
|---|---|
| Room Detection | Identifies bedroom, living room, kitchen, office, etc. |
| Furniture Detection | Lists all detected furniture items |
| Wall Colour Suggestion | Primary + accent with hex codes and reasoning |
| Furniture Arrangement | 3+ actionable rearrangement tips |
| Lighting Ideas | Ambient, task, and accent lighting suggestions |
| Plants & Decor | Indoor plant recommendations with placement |
| After Design Visual | Animated preview of redesigned room |
| Budget Breakdown | Low / Medium / Premium tier with itemised costs |
| Buy Products | Direct links to 10+ Indian brands |

---

## Partner Stores

- **Asian Paints** — Wall paint
- **Berger Paints** — Wall paint
- **IKEA India** — Furniture
- **Pepperfry** — Furniture & Rugs
- **Urban Ladder** — Furniture
- **Home Centre** — Home décor
- **Havells** — Lighting
- **Philips** — Lighting
- **Ugaoo** — Indoor plants

---

## Notes

- Maximum upload size: 16 MB
- Supported formats: JPG, PNG, WEBP
- The "After" image is an AI-generated visual representation, not a photo-realistic render
- All prices are estimates and vary by city and retailer
