# Viva Demo Checklist

Use this checklist for a local viva or dissertation screen-share demo. The app is intended to run from a Mac with the FastAPI backend locally, Expo Metro locally, and a TuneUp development build on an iPhone or iOS Simulator.

## Before the demo

- Charge the iPhone and Mac.
- Connect the Mac and iPhone to the same Wi-Fi.
- Disable VPN, firewall rules, or network filters if they block LAN traffic.
- Confirm `backend/.env` exists and contains local backend values.
- Confirm `MusicAIApp/.env` exists and uses the current Mac LAN IP.
- Open the development build once before the viva.
- Run the demo environment check:

```bash
bash scripts/check-demo-env.sh
```

## Find the Mac LAN IP

From the repository root:

```bash
bash scripts/print-lan-ip.sh
```

Then update `MusicAIApp/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_LAN_IP:8000
```

Do not use `localhost` for a physical iPhone. On a phone, `localhost` points to the phone itself, not the Mac.

## Start backend

For first-time backend setup:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

If your local virtual environment is named `venv`, use `source venv/bin/activate` instead.

Use a dedicated terminal:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

If your local virtual environment is named `venv`, use:

```bash
source venv/bin/activate
```

Verify the backend is alive:

```bash
curl http://localhost:8000/health
```

If `/health` is not available yet, open `http://localhost:8000/docs` or another supported backend route.

## Start frontend Metro

Use a second dedicated terminal:

```bash
cd MusicAIApp
npx expo start --dev-client -c --host lan
```

## iPhone development build

Open the TuneUp development build on the iPhone.

If the development server is not discovered automatically, enter the Metro URL manually:

```text
http://YOUR_MAC_LAN_IP:8081
```

If the development build does not connect with the HTTP URL, try:

```text
exp://YOUR_MAC_LAN_IP:8081
```

## Quick startup helper

From the repository root, this prints the exact commands and current LAN IP:

```bash
bash scripts/start-demo.sh
```

The helper does not print Supabase keys or other secrets.

## Common issues

### No development server found

- Confirm Mac and iPhone are on the same Wi-Fi.
- Run `bash scripts/print-lan-ip.sh`.
- In the iPhone development build, enter `http://YOUR_MAC_LAN_IP:8081`.
- If the HTTP URL does not connect, try `exp://YOUR_MAC_LAN_IP:8081`.
- Restart Metro with `npx expo start --dev-client -c --host lan`.
- Check macOS firewall and Local Network permissions. Allow incoming connections for Terminal, Node, Xcode, or Expo/Metro if macOS prompts.

### Backend unreachable

- Confirm the backend terminal is still running.
- Confirm `MusicAIApp/.env` uses `EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_LAN_IP:8000`.
- Open `http://localhost:8000/health` on the Mac.
- If using Expo web, check `CORS_ALLOW_ORIGINS` in `backend/.env`.

### Wrong LAN IP

- Re-run `bash scripts/print-lan-ip.sh`.
- Update `MusicAIApp/.env`.
- Restart Metro with `npx expo start --dev-client -c --host lan`.
- Reopen the iPhone development build.

### Expo Go vs development build

- Use the TuneUp development build, not Expo Go.
- Native tuner functionality requires the native build because Expo Go cannot load TuneUp's native pitch module.

### Microphone permission denied

- Open iOS Settings.
- Find TuneUp.
- Enable Microphone.
- Return to the app and tap the tuner retry/start control.

### iOS Simulator tuner issues

- The simulator can fail with native audio input format errors.
- For tuner demonstrations, prefer a real iPhone development build.

### Supabase or env config missing

- Run `bash scripts/check-demo-env.sh`.
- Copy missing examples if needed:

```bash
cp backend/.env.example backend/.env
cp MusicAIApp/.env.example MusicAIApp/.env
```

- Fill in local values. Never commit real `.env` files.
- If the backend reports missing environment variables even though `backend/.env` exists, ensure `python-dotenv` is installed and the backend config explicitly loads `backend/.env`.

### Port 8000 already in use

Find the process:

```bash
lsof -i :8000
```

Stop the old backend process, then restart:

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Port 8081 already in use

Stop the old Metro process or let Expo choose another port. If Expo changes the Metro port, enter the displayed URL manually in the development build.

## Demo flow

1. Run `bash scripts/check-demo-env.sh`.
2. Start the backend.
3. Confirm `curl http://localhost:8000/health` returns `status: ok`.
4. Start Expo Metro.
5. Open the TuneUp development build.
6. Check the in-app diagnostics screen if backend connectivity is unclear.
7. Use **Songs → Demo Song** as the offline fallback if backend upload or AI analysis is not available.
8. Demo the core flows that matter for the viva.

The built-in Demo Song is an original synthetic TuneUp chart. It does not use copyrighted audio or tabs, and it is designed to open directly in Song Flow without backend, Supabase, or upload.
