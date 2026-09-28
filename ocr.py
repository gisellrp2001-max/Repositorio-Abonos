"""Read PDFs/images locally with Tesseract and infer voucher fields conservatively."""
from __future__ import annotations
from datetime import datetime
from io import BytesIO
import re
import unicodedata
from PIL import Image, ImageOps

BANKS = {'BCP': r'\bBCP\b|BANCO DE CREDITO', 'BBVA': r'\bBBVA\b',
         'Interbank': r'\bINTERBANK\b', 'Scotiabank': r'\bSCOTIABANK\b',
         'BanBif': r'\bBANBIF\b'}

def read_file(name: str, content: bytes) -> str:
    if name.lower().endswith('.pdf'):
        import fitz
        doc = fitz.open(stream=content, filetype='pdf')
        try:
            if doc.page_count > 5:
                raise ValueError('El PDF debe tener como máximo 5 páginas.')
            extracted = '\n'.join(doc[i].get_text() for i in range(doc.page_count))
            if len(extracted.strip()) > 40:
                return extracted
            return '\n'.join(_image_text(Image.open(BytesIO(doc[i].get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes('png')))) for i in range(doc.page_count))
        finally:
            doc.close()
    return _image_text(Image.open(BytesIO(content)))

def _image_text(image: Image.Image) -> str:
    import pytesseract
    image = ImageOps.autocontrast(ImageOps.grayscale(image))
    return pytesseract.image_to_string(image, lang='spa+eng', config='--psm 6')

def parse_text(text: str) -> dict:
    flat = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().upper()
    result = {key: {'value': '', 'confidence': 'No detectado'} for key in ('bank', 'date', 'time', 'operation', 'amount', 'currency', 'account', 'payer', 'reference')}
    def put(key, value, confidence='Revisar'):
        if value:
            result[key] = {'value': str(value).strip(), 'confidence': confidence}
    for bank, pattern in BANKS.items():
        if re.search(pattern, flat):
            put('bank', bank, 'Alta'); break
    d = re.search(r'\b([0-3]?\d)[/-]([01]?\d)[/-](20\d{2}|\d{2})\b', flat)
    if d:
        try:
            y=int(d[3]); y=y+2000 if y<100 else y
            put('date', datetime(y,int(d[2]),int(d[1])).date().isoformat(), 'Revisar')
        except ValueError: pass
    t = re.search(r'\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b', flat)
    if t: put('time', f'{int(t[1]):02d}:{t[2]}')
    o = re.search(r'(?:(?:N[°Oº.]?\s*(?:DE\s*)?|NRO\.?\s*(?:DE\s*)?)(?:OPERACION|OP\.?|TRANSACCION)|CODIGO\s*DE\s*OPERACION)\s*[:#-]?\s*([A-Z0-9-]{5,24})',flat)
    if o: put('operation', o[1], 'Revisar')
    amounts = re.findall(r'(?:S/\.?|SOLES|USD|US\$|\$)\s*([0-9][0-9., ]{0,17}\d|\d)', flat)
    if amounts:
        raw=amounts[-1].strip().replace(' ','')
        if ',' in raw and '.' in raw: raw=raw.replace(',','') if raw.rfind('.')>raw.rfind(',') else raw.replace('.','').replace(',','.')
        elif ',' in raw: raw=raw.replace(',','.') if len(raw.split(',')[-1])==2 else raw.replace(',','')
        try: put('amount', f'{float(raw):.2f}')
        except ValueError: pass
    if re.search(r'\bUSD\b|US\$|DOLARES',flat): put('currency','USD','Revisar')
    elif re.search(r'S/\.?|\bSOLES\b',flat): put('currency','PEN','Revisar')
    account=re.search(r'(?:CUENTA\s*(?:DESTINO|ABONO)?|CTA\.?\s*DESTINO)\s*[:#-]?\s*([0-9-]{8,30})',flat)
    if account: put('account',account[1])
    payer=re.search(r'(?:ORDENANTE|PAGADOR|DEPOSITANTE)\s*[:#-]\s*([^\n]{4,80})',text,re.I)
    if payer: put('payer',payer[1])
    return result

def extract(files: list[tuple[str,bytes]]) -> tuple[dict,str,list[str]]:
    parts=[]; errors=[]
    for name,content in files:
        try: parts.append(f'[{name}]\n{read_file(name,content)}')
        except Exception as exc: errors.append(f'{name}: no se pudo leer ({type(exc).__name__}).')
    text='\n'.join(parts)
    return parse_text(text),text,errors
