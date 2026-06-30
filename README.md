# 🏛️ DesignAI Studio

AI Interior Design platform powered by **FLUX.1** (via Pollinations) + **Google Gemini** + **YOLOv8**.

## Folder Structure

```
interior-ai/
├── app.py                    ← Flask backend
├── requirements.txt          ← Python dependencies
├── .env                      ← Your API keys (create this)
├── .env.example              ← Template for .env
├── README.md
├── templates/
│   └── index.html            ← Full UI
└── static/
    ├── css/
    │   └── style.css         ← All styles
    ├── js/
    │   └── app.js            ← All frontend logic
    └── uploads/              ← Auto-created on first run
```

## Setup

### 1. Create virtual environment
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Create .env file
```
GEMINI_API_KEY=your_key_here
```
Get free key: https://aistudio.google.com/app/apikey

### 4. Run
```bash
python app.py
```
Open: http://localhost:5000

---

## Image Generation — FLUX.1

This app uses **Pollinations.ai** which runs **FLUX.1 Dev** as its backend model.
- **Completely free**, no API key needed
- Generates 1024×768 photorealistic images
- URL: `https://image.pollinations.ai/prompt/...?model=flux`

### Optional: Run FLUX.1 Locally
For full local FLUX.1 Dev, you need 16GB+ VRAM GPU:
```bash
pip install diffusers torch transformers accelerate
```
Then in app.py, set `USE_LOCAL_FLUX = True` and install the model.

---

## Features
- ✅ YOLOv8 furniture detection
- ✅ Gemini AI room analysis
- ✅ FLUX.1 image generation
- ✅ 10 wall color options
- ✅ 9 furniture options
- ✅ 5 lighting options
- ✅ 6 curtain styles
- ✅ 5 flooring types
- ✅ 9 decoration items
- ✅ 7 interior themes
- ✅ 3 budget tiers with Indian ₹ pricing
- ✅ Product links (IKEA, Asian Paints, Philips, etc.)
- ✅ Real-time regeneration preserving room structure

