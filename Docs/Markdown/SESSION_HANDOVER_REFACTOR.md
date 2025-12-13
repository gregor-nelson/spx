# SPX Options Monitor - Refactor Handover

## Date: December 4, 2025 (Session 6 - Interrupted)

---

## Context

I'm building an SPX OTM put volume anomaly detection system. A project restructure was started but interrupted mid-way. I need you to:

1. **Validate the partial refactor** - compare old vs new files for correctness
2. **Complete the remaining steps** - finish JS extraction, update index.html, cleanup old files
3. **Note the deferred UI work** - frontend styling improvements for a future session

---

## Files to Read First

1. `Docs/SESSION_SUMMARY_20251204_V3.md` - System context and what was built
2. Review both old and new file locations (listed below)

---

## What Was Done (Needs Validation)

New `src/` folder created with refactored Python files:

| New Location | Original Location |
|--------------|-------------------|
| `src/database.py` | `Database/spx_database.py` |
| `src/poller.py` | `spx_poller.py` |
| `src/eod.py` | `spx_eod.py` |
| `src/scheduler.py` | `spx_scheduler.py` |
| `src/server.py` | `server.py` (+ static file serving added) |
| `src/__init__.py` | (new file) |

CSS extracted:
- `static/css/styles.css` ← extracted from `index.html` `<style>` block

**TASK 1: Validate these new files against originals. Check imports are correct, no code was lost.**

---

## What's NOT Done (Complete These)

### 1. Extract JS from index.html

Create `static/js/dashboard.js` with the JavaScript from `index.html`:
- JS is approximately lines 545-1306 in index.html (inside `<script>` tags)
- Copy content only, not the script tags themselves

### 2. Update index.html

- Remove embedded `<style>` block (already extracted to CSS file)
- Remove embedded `<script>` block (after extracting to JS file)
- Add in `<head>`: `<link rel="stylesheet" href="/css/styles.css">`
- Add before `</body>`: `<script src="/js/dashboard.js"></script>`
- Move updated file to `static/index.html`

### 3. Create requirements.txt

Create at project root:
```
flask>=2.0
requests>=2.25
python-dotenv>=0.19
```

### 4. Delete old files (after validation passes)

```
# Old Python files to remove:
spx_scheduler.py
spx_poller.py
spx_eod.py
server.py

# Old folder to remove entirely:
Database/

# Original index.html (after moved to static/)
index.html
```

### 5. Test the refactored system

```bash
# Test server serves dashboard
python src/server.py
# Open http://localhost:5000 - verify page loads with styles

# Test poller runs standalone
python src/poller.py

# Test scheduler starts
python src/scheduler.py
# Ctrl+C after confirming it initializes
```

---

## Deferred: Frontend UI Overhaul (Future Session)

After refactor is stable, the dashboard needs visual polish to look more like a professional broker terminal (Bloomberg/TWS style):

- Tighter/compact layout, less padding
- Monospace fonts for all numbers
- Smaller data-dense typography
- Subtle shadows, thinner borders
- Card-based layout refinements

The CSS is now cleanly organized in `static/css/styles.css` with section comments, ready for styling updates.

---

## Running the System (After Refactor Complete)

```bash
# Dashboard
python src/server.py
# Open http://localhost:5000

# Scheduler (production - runs continuously)
python src/scheduler.py

# Manual poll (testing)
python src/poller.py

# Manual EOD
python src/eod.py [YYYY-MM-DD]
```

---

## Important Notes

- Validate before deleting anything
- Keep changes minimal and focused
- Test after completion
- The database file `spx_options.db` stays at project root

---

**End of Handover**
