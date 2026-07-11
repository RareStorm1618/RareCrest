"""OCR key scanned RareStorm PDFs with EasyOCR; save text extracts."""
from pathlib import Path
import fitz
import easyocr

src = Path(r"C:\Users\MP3-Backup\Documents\GitHub\RareStorm")
out = Path(r"C:\Users\MP3-Backup\Documents\GitHub\EXO\research\rarestorm-extract")
out.mkdir(parents=True, exist_ok=True)
img_dir = out / "_ocr_pages"
img_dir.mkdir(exist_ok=True)

reader = easyocr.Reader(["en"], gpu=False)

targets = [
    ("Letter of determination.pdf", None),  # all pages
    ("6 Master 501c3 6-13-26.pdf", list(range(9))),  # all 9
    ("2-26-25 CHANGE COMPANY  NAME   TO     RARESTORM.pdf", None),
]

for name, pages in targets:
    pdf_path = src / name
    if not pdf_path.exists():
        print("MISSING", name)
        continue
    doc = fitz.open(pdf_path)
    page_idxs = pages if pages is not None else list(range(len(doc)))
    chunks = [f"# OCR: {name}\n"]
    for i in page_idxs:
        if i >= len(doc):
            continue
        page = doc[i]
        # high-res render
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_path = img_dir / f"{pdf_path.stem}_p{i+1}.png"
        pix.save(str(img_path))
        print(f"OCR {name} page {i+1}/{len(doc)} ...")
        result = reader.readtext(str(img_path), detail=0, paragraph=True)
        text = "\n".join(result) if isinstance(result, list) else str(result)
        chunks.append(f"\n\n===== PAGE {i+1}/{len(doc)} =====\n{text}")
    out_path = out / f"{pdf_path.stem}.ocr.txt"
    out_path.write_text("".join(chunks), encoding="utf-8", errors="replace")
    print(f"Wrote {out_path} chars={sum(len(c) for c in chunks)}")
    doc.close()

print("OCR DONE")
