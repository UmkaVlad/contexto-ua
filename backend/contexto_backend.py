"""
Contexto UA — бекенд для гри.
Працює з файлами: clean_words.txt та embeddings_ua.pt
"""
import os
import random
from pathlib import Path
from datetime import date
import hashlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

app = FastAPI(title="Contexto UA API")

# Дозволяємо запити з браузера (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ШЛЯХИ ДО ФАЙЛІВ ---
BASE = Path(__file__).resolve().parent.parent
# Тепер використовуємо нові файли, які ми створили
WORDS_PATH = BASE / "clean_words.txt"
EMBEDDINGS_PATH = BASE / "embeddings_ua.pt"

# Глобальні змінні
words_list: list[str] = []
word_to_index: dict[str, int] = {}
embeddings_tensor = None


def load_data():
    """Завантажує слова та вектори при старті сервера."""
    global words_list, word_to_index, embeddings_tensor

    # 1. Завантаження слів
    if not WORDS_PATH.exists():
        print(f"❌ ПОМИЛКА: Не знайдено файл {WORDS_PATH}")
        return
    
    with open(WORDS_PATH, "r", encoding="utf-8") as f:
        # Просто читаємо рядки, бо файл вже чистий
        words_list = [line.strip() for line in f if line.strip()]
    
    word_to_index = {w: i for i, w in enumerate(words_list)}
    print(f"✅ Завантажено слів: {len(words_list)}")

    # 2. Завантаження векторів
    if TORCH_AVAILABLE and EMBEDDINGS_PATH.exists():
        print("⏳ Завантажую вектори (це може зайняти кілька секунд)...")
        try:
            embeddings_tensor = torch.load(EMBEDDINGS_PATH, map_location="cpu")
            # Якщо завантажився список тензорів, перетворюємо в один великий тензор
            if isinstance(embeddings_tensor, list):
                 embeddings_tensor = torch.stack(embeddings_tensor)
            
            # Переконаємося, що це float32
            if not isinstance(embeddings_tensor, torch.Tensor):
                 embeddings_tensor = torch.tensor(embeddings_tensor, dtype=torch.float32)

            print(f"✅ Вектори завантажено! Розмір: {embeddings_tensor.shape}")
        except Exception as e:
            print(f"❌ Помилка завантаження векторів: {e}")
            embeddings_tensor = None
    else:
        print(f"⚠️ Увага: файл векторів {EMBEDDINGS_PATH} не знайдено або Torch не встановлено.")


@app.on_event("startup")
def startup():
    load_data()


def get_secret_index(level: int, seed_date: str) -> int:
    """Вибирає секретне слово на основі дати (щоб у всіх було однакове)."""
    # Сіль для генерації (можна змінити)
    unique_str = f"contexto_ua_game_{seed_date}_{level}"
    h = hashlib.sha256(unique_str.encode()).hexdigest()
    # Перетворюємо хеш на число і беремо по модулю кількості слів
    idx = int(h[:10], 16) % len(words_list)
    return idx


def get_position(secret_idx: int, guess_idx: int) -> int:
    """Рахує позицію слова (1 = перемога)."""
    if embeddings_tensor is None:
        return 9999 # Заглушка, якщо вектори не завантажились

    # Вектор секретного слова
    target_vec = embeddings_tensor[secret_idx].unsqueeze(0)
    
    # Рахуємо схожість з усіма словами одразу (Cosine Similarity)
    # Формула: (A . B) / (|A| * |B|)
    sim_all = torch.nn.functional.cosine_similarity(embeddings_tensor, target_vec)
    
    # Схожість нашого слова
    guess_sim = sim_all[guess_idx].item()
    
    # Позиція = (кількість слів, у яких схожість БІЛЬША ніж у нашого) + 1
    position = (sim_all > guess_sim).sum().item() + 1
    
    return position


# --- API ---

class GuessRequest(BaseModel):
    level: int = 1
    seed_date: str = "" # YYYY-MM-DD
    word: str

class GuessResponse(BaseModel):
    position: int
    normalized_word: str
    found: bool
    error: str = ""

@app.post("/api/guess", response_model=GuessResponse)
def api_guess(req: GuessRequest):
    if not req.seed_date:
        req.seed_date = date.today().isoformat()

    guess_word = req.word.strip().lower()

    # Перевірка: чи є слово в словнику
    if guess_word not in word_to_index:
        return GuessResponse(position=0, normalized_word=guess_word, found=False, error="Слово не знайдено")

    secret_idx = get_secret_index(req.level, req.seed_date)
    guess_idx = word_to_index[guess_word]

    # Якщо вгадали
    if secret_idx == guess_idx:
        return GuessResponse(position=1, normalized_word=words_list[guess_idx], found=True)

    # Рахуємо позицію
    pos = get_position(secret_idx, guess_idx)
    
    return GuessResponse(
        position=pos,
        normalized_word=words_list[guess_idx],
        found=True,
    )

@app.post("/api/giveup")
def api_giveup(req: GuessRequest):
    """Якщо гравець здається"""
    if not req.seed_date:
        req.seed_date = date.today().isoformat()
    secret_idx = get_secret_index(req.level, req.seed_date)
    return {"secret_word": words_list[secret_idx]}

# Підключаємо папку frontend як статичний сайт
FRONTEND_PATH = BASE / "frontend"
if FRONTEND_PATH.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_PATH), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    print("🚀 Запускаємо сервер Contexto UA...")
    uvicorn.run(app, host="0.0.0.0", port=8000)