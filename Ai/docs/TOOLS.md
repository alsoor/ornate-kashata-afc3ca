# أدوات Stooorna Ai

## كيف تُستخدم كل أداة داخل المجلد

### VS Code / Cursor
- المجلد `.vscode/` يضبط المفسّر، التشغيل، والامتدادات.
- افتح مجلد `Ai` كمشروع منفصل في Cursor أو VS Code.

### FastAPI
- نقطة الدخول: `backend/app/main.py`
- المسارات تحت البادئة `/ai`.

### Docker
- `docker/Dockerfile` + `docker/docker-compose.yml`
- البيانات تُحفظ في volume مربوط بـ `Ai/data`.

### OpenAI / Gemini / Ollama
- التنفيذ في `backend/app/services/llm.py`
- الاختيار عبر `LLM_PROVIDER` في `.env`.

### LangChain / LlamaIndex
- مُثبّتان في `requirements.txt` للتوسعة.
- أضف سلاسل/فهارس تحت `backend/app/services/` دون لمس باقي Stooorna.

### Pinecone / ChromaDB
- التنفيذ في `backend/app/services/vectors.py`
- الافتراضي: Chroma محلي في `data/chroma`.

### Hugging Face
- `HF_TOKEN` + `transformers` / `huggingface-hub`
- مسار الكاش: `data/huggingface`.

### Pandas / NumPy
- متوفران لأي معالجة بيانات أو جداول داخل الخدمات.

### PyTorch / TensorFlow
- مُعلّقان في `requirements.txt` (حجمهما كبير).
- فعّلهما عند الحاجة لنماذج محلية ثقيلة.
