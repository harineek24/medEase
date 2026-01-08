# 🚀 Quick Start Guide - MedEase EHR Summarizer

Get up and running in 3 simple steps!

## Step 1: Get Your Gemini API Key (2 minutes)

1. Go to: **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key (it starts with `AIza...`)

**Keep this key safe!** You'll need it in the next step.

## Step 2: Setup the Application (5 minutes)

### Mac/Linux Users

```bash
# 1. Make the startup script executable
chmod +x start.sh

# 2. Run the setup
./start.sh

# 3. Choose option 1 (Setup - First Time Installation)
# Follow the prompts and paste your API key when asked
```

### Windows Users

```cmd
# 1. Run the startup script
start.bat

# 2. Choose option 1 (Setup - First Time Installation)
# Follow the prompts and paste your API key when asked
```

### Manual Setup (If scripts don't work)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env and add: GEMINI_API_KEY=your_key_here
```

**Frontend:**
```bash
cd frontend
npm install
```

## Step 3: Run the Application (30 seconds)

### Using Startup Scripts (Recommended)

**Mac/Linux:**
```bash
./start.sh
# Choose option 4 (Run Both Backend and Frontend)
```

**Windows:**
```cmd
start.bat
REM Choose option 4 (Run Both Backend and Frontend)
```

### Manual Start

**Terminal 1 (Backend):**
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python main.py
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

## 🎉 You're Ready!

Open your browser and go to: **http://localhost:3000**

1. Drag and drop a medical document (PDF, PNG, or JPG)
2. Wait 10-20 seconds for AI processing
3. Read your patient-friendly summary!

## 📋 What You Can Upload

- ✅ Lab test results (PDF or image)
- ✅ Doctor visit notes
- ✅ Hospital discharge summaries
- ✅ Prescription documents
- ✅ Medical imaging reports
- ✅ Any medical document under 25MB

## 🐛 Common Issues

### "GEMINI_API_KEY not found"

**Fix:**
```bash
cd backend
cp .env.example .env
# Edit .env and add your API key
```

### "Port already in use"

**Fix:**
- Backend (8000): Close other applications using port 8000
- Frontend (3000): Close other applications using port 3000

### "Module not found" errors

**Fix:**
```bash
# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### Cannot connect to backend

**Fix:**
1. Check backend is running: http://localhost:8000
2. Should see: `{"status":"healthy"}`
3. If not, restart the backend server

## 💡 Tips

- **File quality matters**: Clearer scans = better summaries
- **Test with sample documents**: Try a simple lab report first
- **Save your summaries**: Auto-saved in `outputs/summaries/`
- **Print or download**: Use buttons in the results view
- **Mobile friendly**: Works on phones and tablets too!

## 🆘 Need Help?

1. Check the full **README.md** for detailed documentation
2. Review the Troubleshooting section
3. Ensure Python 3.9+ and Node.js 18+ are installed
4. Verify your Gemini API key is valid

## 📞 System Requirements

- **Python**: 3.9 or higher
- **Node.js**: 18 or higher
- **Internet**: Required for Gemini API
- **Browser**: Modern browser (Chrome, Firefox, Safari, Edge)
- **RAM**: 2GB minimum, 4GB recommended
- **Disk Space**: 500MB for dependencies

## 🎯 Next Steps

Once you're running:

1. **Try a test document**: Upload a sample medical report
2. **Explore the summary**: See how medical jargon is simplified
3. **Download markdown**: Save summaries for your records
4. **Read the disclaimer**: Remember this is informational, not medical advice

## ⚠️ Important Reminders

- 🔒 **Your API key is private** - never share it
- 📝 **Summaries are AI-generated** - always verify with your doctor
- 🚨 **Not for emergencies** - call 911 for urgent medical issues
- 💾 **Files aren't stored** - only summaries are saved locally

---

**That's it!** You're ready to start simplifying medical documents.

Happy summarizing! 🏥✨
