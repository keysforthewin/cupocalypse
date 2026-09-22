"""Check decoded delivery assets; no provider calls or third-party Python packages."""
import subprocess, json, pathlib, array, math
report = {}
for p in pathlib.Path('public/assets/audio').glob('*.mp3'):
    def samples(filters=None):
        cmd = ['ffmpeg', '-v', 'error', '-i', str(p), '-ac', '1', '-ar', '44100']
        if filters:
            cmd += ['-af', filters]
        a = array.array('f')
        a.frombytes(subprocess.check_output(cmd + ['-f', 'f32le', '-']))
        return a
    a = samples()
    energy = sum(v*v for v in a)
    low, high = samples('lowpass=f=250'), samples('highpass=f=5000')
    report[p.stem] = {
        'duration': round(len(a)/44100, 3),
        'peakDBFS': round(20*math.log10(max(abs(v) for v in a)+1e-9), 2),
        'rmsDBFS': round(10*math.log10(energy/len(a)+1e-9), 2),
        'lowpass250EnergyRatio': round(sum(v*v for v in low)/energy, 3),
        'highpass5000EnergyRatio': round(sum(v*v for v in high)/energy, 4),
        'finite': all(math.isfinite(v) for v in a),
    }
    assert -35 < report[p.stem]['peakDBFS'] < -4
    assert report[p.stem]['rmsDBFS'] > -45
    assert report[p.stem]['duration'] >= 0.5
    assert report[p.stem]['highpass5000EnergyRatio'] < 0.08
    assert report[p.stem]['finite']
assert len(report) == 8
pathlib.Path('artifacts/projectiles/audio-analysis.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
