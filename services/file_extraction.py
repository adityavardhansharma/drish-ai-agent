import os
import logging

logger = logging.getLogger(__name__)

ALLOWED_DOCUMENT_EXTENSIONS = {"pdf", "docx", "doc", "txt"}
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "bmp"}


def allowed_file(filename, allowed_extensions):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


def extract_text_from_pdf(pdf_path):
    import PyPDF2

    text = ""
    with open(pdf_path, "rb") as f:
        pdf_reader = PyPDF2.PdfReader(f)
        if pdf_reader.is_encrypted:
            try:
                pdf_reader.decrypt("")
            except Exception as error:
                logger.error("Decrypt error for %s: %s", pdf_path, error)
                raise ValueError(
                    f"PDF file '{os.path.basename(pdf_path)}' is encrypted."
                ) from error
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text


def extract_text_from_docx(docx_path):
    import docx

    document = docx.Document(docx_path)
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def extract_text_from_file(file_path):
    _, file_extension = os.path.splitext(file_path)
    file_extension = file_extension.lower()

    if file_extension == ".pdf":
        return extract_text_from_pdf(file_path)
    if file_extension in [".docx", ".doc"]:
        return extract_text_from_docx(file_path)
    if file_extension == ".txt":
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1") as f:
                return f.read()

    raise ValueError(f"Unsupported file type: {file_extension}")
