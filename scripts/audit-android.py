"""Audit local packages without printing environment values or report content."""
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[1]
secrets = []
environment = root / '.env'
if environment.exists():
    for line in environment.read_text(encoding='utf-8').splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        name, value = line.split('=', 1)
        if re.search(r'API_KEY|SERVICE_ROLE_KEY|ACCESS_CODE|PASSWORD|SECRET', name):
            value = value.strip().strip('"\'')
            if len(value) >= 6:
                secrets.extend([value.encode(), value.encode('utf-16-le')])

for path in sorted((root / 'release/android').glob('*')):
    if path.suffix not in ['.apk', '.aab']:
        continue
    with zipfile.ZipFile(path) as archive:
        failures = []
        for name in archive.namelist():
            data = archive.read(name)
            if any(secret in data for secret in secrets):
                failures.append(name)
            if '/public/' in name and any(key in data for key in [b'TAVUS_API_KEY', b'GEMINI_API_KEY', b'SUPABASE_SERVICE_ROLE_KEY']):
                failures.append(name)
        if failures:
            raise SystemExit(f'{path.name}: secret audit FAILED')
    print(f'{path.name}: secret audit PASS; {path.stat().st_size} bytes')

bundled = root / 'dist/android-web'
for path in bundled.rglob('*'):
    if path.is_file() and any(secret in path.read_bytes() for secret in secrets):
        raise SystemExit('Bundled frontend secret audit FAILED')
print('Bundled frontend: secret audit PASS')
