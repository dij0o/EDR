from pathlib import Path
import re

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "EDR_Testing_Services_Tooling_and_Scope_Mapping.md"
OUTPUT = ROOT / "docs" / "EDR_Testing_Services_Tooling_and_Scope_Mapping.docx"

BLUE = "1F4E79"
LIGHT_BLUE = "EAF2F8"
PALE_BLUE = "F6FAFD"
GREY = "6B7280"
RED = "A61B1B"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=90, bottom=90, end=90):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, size=9.5, color=None, bold=False, italic=False, name="Arial"):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_inline(paragraph, text, size=9.5, color=None):
    """Very small inline parser for **bold** and `code` spans."""
    token_re = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`)")
    pos = 0
    for match in token_re.finditer(text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos : match.start()])
            set_run_font(run, size=size, color=color)
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            set_run_font(run, size=size, color=color, bold=True)
        else:
            run = paragraph.add_run(token[1:-1])
            set_run_font(run, size=size, color=color, name="Consolas")
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_run_font(run, size=size, color=color)


def add_hyperlink_like_bullet(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    add_inline(p, "- " + text, size=8.8)


def clean_table_row(line):
    return [cell.strip().replace("<br>", "\n") for cell in line.strip().strip("|").split("|")]


def is_separator(line):
    stripped = line.strip().strip("|").strip()
    return bool(stripped) and all(part.strip().replace("-", "").replace(":", "") == "" for part in stripped.split("|"))


def set_col_widths(table, widths):
    for row in table.rows:
        for idx, width in enumerate(widths):
            if idx < len(row.cells):
                row.cells[idx].width = Inches(width)


def format_table(table, widths=None):
    table.style = "Table Grid"
    table.autofit = True
    if widths:
        set_col_widths(table, widths)
    for r_idx, row in enumerate(table.rows):
        for cell in row.cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.05
                for run in paragraph.runs:
                    set_run_font(run, size=8.2 if len(row.cells) >= 4 else 8.6)
            if r_idx == 0:
                set_cell_shading(cell, BLUE)
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        set_run_font(run, size=8.4 if len(row.cells) >= 4 else 8.8, color="FFFFFF", bold=True)
            elif r_idx % 2 == 0:
                set_cell_shading(cell, PALE_BLUE)
    if table.rows:
        set_repeat_table_header(table.rows[0])


def table_widths_for(headers):
    count = len(headers)
    joined = " ".join(headers).lower()
    if count == 2:
        return [2.1, 8.0]
    if count == 3:
        return [2.4, 4.1, 4.1]
    if count == 4 and "test id" in joined:
        return [1.0, 2.6, 3.6, 3.4]
    if count == 4 and "artefact" in joined:
        return [1.0, 2.1, 4.4, 3.2]
    if count == 4 and "dependency / input" in joined:
        return [2.0, 3.2, 3.0, 3.3]
    if count == 4:
        return [1.3, 2.5, 3.8, 3.1]
    return None


def add_markdown_table(doc, rows):
    header = clean_table_row(rows[0])
    body = [clean_table_row(row) for row in rows[1:] if not is_separator(row)]
    table = doc.add_table(rows=1, cols=len(header))
    for idx, text in enumerate(header):
        p = table.rows[0].cells[idx].paragraphs[0]
        add_inline(p, text, size=8.8)
    for source_row in body:
        cells = table.add_row().cells
        for idx, text in enumerate(source_row[: len(cells)]):
            p = cells[idx].paragraphs[0]
            add_inline(p, text, size=8.2 if len(header) >= 4 else 8.6)
    format_table(table, table_widths_for(header))
    doc.add_paragraph()


def add_callout(doc, title, body, fill=LIGHT_BLUE, title_color=BLUE):
    table = doc.add_table(rows=1, cols=1)
    table.autofit = True
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    set_cell_margins(cell, top=150, start=170, bottom=150, end=170)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(title)
    set_run_font(r, size=10.5, color=title_color, bold=True)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    add_inline(p2, body, size=9.2)
    doc.add_paragraph()


def configure_styles(doc):
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    normal.font.size = Pt(9.5)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.08

    for name, size, color in (
        ("Heading 1", 15, BLUE),
        ("Heading 2", 12, BLUE),
        ("Heading 3", 10.5, BLUE),
    ):
        style = styles[name]
        style.font.name = "Arial"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = True
        style.paragraph_format.space_before = Pt(10 if name == "Heading 1" else 7)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.keep_with_next = True

    bullet = styles["List Bullet"]
    bullet.font.name = "Arial"
    bullet._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    bullet.font.size = Pt(9.2)
    bullet.paragraph_format.space_after = Pt(2)
    bullet.paragraph_format.line_spacing = 1.05


def configure_section(section):
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.top_margin = Cm(1.15)
    section.bottom_margin = Cm(1.15)
    section.left_margin = Cm(1.25)
    section.right_margin = Cm(1.25)
    section.header_distance = Cm(0.7)
    section.footer_distance = Cm(0.7)


def add_footer(doc):
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("EDR Testing Services Tooling and Scope Mapping | Draft 0.2")
    set_run_font(run, size=8.0, color=GREY)


def add_cover(doc):
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(22)
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("EDR Testing Services\nTooling and Scope Mapping")
    set_run_font(run, size=25, color=BLUE, bold=True)
    title.paragraph_format.space_after = Pt(12)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("Blockchain-Based Electronic Dental Record (EDR) Sharing and Management System")
    set_run_font(run, size=12.5, color=GREY)
    subtitle.paragraph_format.space_after = Pt(22)

    meta = doc.add_table(rows=3, cols=2)
    meta.cell(0, 0).text = "Version"
    meta.cell(0, 1).text = "Draft 0.2"
    meta.cell(1, 0).text = "Project"
    meta.cell(1, 1).text = "Blockchain-Based Electronic Dental Record (EDR) Sharing and Management System"
    meta.cell(2, 0).text = "Prepared for discussion"
    meta.cell(2, 1).text = "Synergic testing services scope alignment"
    format_table(meta, [2.2, 6.8])

    add_callout(
        doc,
        "Scope boundary",
        "Resolution of any defects, vulnerabilities, compliance gaps, architecture gaps, performance bottlenecks, Kubernetes migration requirements, or implementation issues identified during testing is outside the testing service scope. A dedicated implementation team must be arranged separately to implement fixes.",
        fill="FDECEC",
        title_color=RED,
    )
    doc.add_page_break()


def collect_contents(lines):
    headings = []
    for line in lines:
        if line.startswith("## "):
            headings.append(line[3:].strip())
    return headings


def add_contents(doc, headings):
    p = doc.add_paragraph(style="Heading 1")
    p.add_run("Contents")
    cols = doc.add_table(rows=0, cols=2)
    cols.autofit = True
    half = (len(headings) + 1) // 2
    for left, right in zip(headings[:half], headings[half:] + [""] * half):
        row = cols.add_row().cells
        row[0].text = left
        row[1].text = right
    format_table(cols, [5.0, 5.0])
    doc.add_page_break()


def build():
    md = SOURCE.read_text(encoding="utf-8").splitlines()
    body_start = next(i for i, line in enumerate(md) if line.startswith("## 1. Purpose"))
    body_lines = md[body_start:]

    doc = Document()
    configure_section(doc.sections[0])
    configure_styles(doc)
    add_footer(doc)
    add_cover(doc)
    add_contents(doc, collect_contents(body_lines))

    table_buffer = []
    pending_callout_title = None
    for line in body_lines:
        if line.strip().startswith("|"):
            table_buffer.append(line)
            continue
        if table_buffer:
            add_markdown_table(doc, table_buffer)
            table_buffer = []

        stripped = line.strip()
        if not stripped:
            continue
        if pending_callout_title:
            add_callout(doc, pending_callout_title, stripped, fill=LIGHT_BLUE, title_color=BLUE)
            pending_callout_title = None
            continue
        if stripped.startswith("### "):
            doc.add_paragraph(stripped[4:], style="Heading 3")
        elif stripped.startswith("## "):
            doc.add_paragraph(stripped[3:], style="Heading 1")
        elif stripped.startswith("# "):
            continue
        elif stripped.startswith("- "):
            if stripped.startswith("- http") or "://" in stripped:
                add_hyperlink_like_bullet(doc, stripped[2:])
            else:
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(2)
                add_inline(p, "- " + stripped[2:], size=9.2)
        elif stripped.startswith("Important note:"):
            add_callout(doc, "Important note", stripped.replace("Important note:", "", 1).strip(), fill="FDECEC", title_color=RED)
        elif stripped.startswith("Recommendation:"):
            add_callout(doc, "Recommendation", stripped.replace("Recommendation:", "", 1).strip(), fill=LIGHT_BLUE, title_color=BLUE)
        elif stripped.startswith("Important GDPR interpretation note:"):
            pending_callout_title = "Important GDPR interpretation note"
        else:
            p = doc.add_paragraph()
            add_inline(p, stripped, size=9.5)

    if table_buffer:
        add_markdown_table(doc, table_buffer)

    # Keep the last references section compact.
    for p in doc.paragraphs:
        if "Reference Sources for Tool and Regulatory Alignment" in p.text:
            p.paragraph_format.page_break_before = True
        if p.text.startswith("Infrastructure and execution dependencies:"):
            p.paragraph_format.page_break_before = True
        if p.text.startswith("6. Deliverable-to-Tool Mapping"):
            p.paragraph_format.page_break_before = True

    doc.core_properties.title = "EDR Testing Services Tooling and Scope Mapping"
    doc.core_properties.subject = "Testing scope, tool mapping, evidence, and exclusions"
    doc.core_properties.author = "Synergic testing services scope alignment"
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
