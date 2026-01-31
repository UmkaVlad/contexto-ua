#!/bin/bash
# Запуск Contexto UA на http://localhost:8000/
# Виконайте в Терміналі: cd "шлях/до/game_files" && ./run.sh

cd "$(dirname "$0")"

# Шукаємо робочий Python (системний часто потребує Xcode)
PYTHON=""
for p in python3 python3.12 python3.11 python3.10; do
  if command -v "$p" &>/dev/null; then
    if "$p" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" 2>/dev/null; then
      PYTHON="$p"
      break
    fi
  fi
done
# Типові шляхи Python з python.org (без Xcode)
[ -z "$PYTHON" ] && [ -x "/usr/local/bin/python3" ] && PYTHON="/usr/local/bin/python3"
[ -z "$PYTHON" ] && [ -x "/opt/homebrew/bin/python3" ] && PYTHON="/opt/homebrew/bin/python3"
[ -z "$PYTHON" ] && [ -d "/Library/Frameworks/Python.framework/Versions" ] && \
  for v in 3.12 3.11 3.10; do
    [ -x "/Library/Frameworks/Python.framework/Versions/$v/bin/python3" ] && PYTHON="/Library/Frameworks/Python.framework/Versions/$v/bin/python3" && break
  done

if [ -z "$PYTHON" ]; then
  echo "Помилка: не знайдено робочий Python (3.8+)."
  echo ""
  echo "На Mac системний Python часто потребує Xcode. Краще встановити Python окремо:"
  echo "  1. Відкрийте https://www.python.org/downloads/"
  echo "  2. Завантажте «macOS 64-bit installer» для Python 3.12"
  echo "  3. Встановіть і перезапустіть Термінал"
  echo "  4. Виконайте знову: ./run.sh"
  echo ""
  echo "Або встановіть Xcode Command Line Tools (велике завантаження):"
  echo "  xcode-select --install"
  exit 1
fi

echo "Використовую Python: $PYTHON"

# Створюємо venv тільки якщо його немає або він пошкоджений
if [ ! -f ".venv/bin/pip" ]; then
  echo "Створюю віртуальне середовище..."
  rm -rf .venv
  "$PYTHON" -m venv .venv
  if [ ! -f ".venv/bin/pip" ]; then
    echo "Помилка: не вдалося створити віртуальне середовище."
    echo "Встановіть Python з https://www.python.org/downloads/ (не потребує Xcode) і спробуйте знову."
    exit 1
  fi
fi

echo "Встановлюю залежності..."
.venv/bin/pip install -q -r backend/requirements.txt
if [ $? -ne 0 ]; then
  echo "Помилка при встановленні залежностей. Спробуйте: .venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi

echo "Запускаю сервер..."
echo ""
echo "  Відкрийте в браузері ОДНУ з адрес:"
echo "    http://localhost:8000/"
echo "    http://127.0.0.1:8000/"
echo ""
echo "  НЕ відкривайте 0.0.0.0 — це тільки для сервера."
echo "  Зупинити сервер: Ctrl+C"
echo ""
.venv/bin/uvicorn backend.contexto_backend:app --host 0.0.0.0 --port 8000
