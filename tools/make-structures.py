#!/usr/bin/env python3
"""Zeichnet die Strukturformeln der Wirkstoffe und schreibt sie als TypeScript-Modul.

Aufruf (aus dem Hauptordner des Repositorys):

    pip install rdkit
    python3 tools/make-structures.py

Ergebnis: web/src/features/medications/structures.generated.ts

Die Strukturen stammen als SMILES aus PubChem (https://pubchem.ncbi.nlm.nih.gov). RDKit zeichnet daraus
zweidimensionale Skelettformeln, hier mit kleinen Anpassungen:

- Die Bindungen und Atombeschriftungen tragen Klassen statt fester Farben (n = Stickstoff, o = Sauerstoff,
  s = Schwefel, x = Halogene, m = Metall). Die Farben legt das Stylesheet fest und passen sich dem
  hellen und dunklen Modus an. Schwarz wird zur Textfarbe (currentColor).
- Ein Molekülteil lässt sich farbig hinterlegen (Klasse ha oder hb). Die Teile werden über SMARTS ausgewählt.
- Die Zeichnung wird so gedreht, dass das Molekül quer liegt, und auf das Seitenverhältnis des Moleküls zugeschnitten.
"""

from __future__ import annotations

import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import Descriptors, rdDepictor, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/src/features/medications/structures.generated.ts"

# Farben der Hervorhebung (RDKit rechnet sie auf 8 Bit um; die Klassen unten ordnen sie wieder zu).
HL = {"a": (1.0, 0.72, 0.27), "b": (0.4, 0.8, 0.9)}

# Bindungslänge in Zeichenpixeln (Fläche 560 breit); lange Moleküle werden nur so weit verkleinert, wie sie auf die Fläche passen.
BOND_LENGTH = 56
# Rand um die äußersten Atome (Platz für Atombeschriftungen und Hervorhebungen)
CROP_MARGIN = 30.0

# id: SMILES (PubChem), Hervorhebungen als (SMARTS, Gruppe), optional Formel und Molmasse von Hand.
MOLECULES: dict[str, dict] = {
    # Omeprazol: Sulfinylbrücke zwischen Benzimidazol und Pyridin (wird im sauren Milieu zum aktiven Sulfenamid).
    "omeprazol": {
        "smiles": "CC1=CN=C(C(=C1OC)C)CS(=O)C2=NC3=C(N2)C=C(C=C3)OC",
        "marks": [("[#6]S(=O)[#6]", "a")],
    },
    # Prednisolon: zusätzliche Doppelbindung im A-Ring (C1=C2) gegenüber Hydrocortison.
    "prednisolon": {
        "smiles": "C[C@]12C[C@@H]([C@H]3[C@H]([C@@H]1CC[C@@]2(C(=O)CO)O)CCC4=CC(=O)C=C[C@]34C)O",
        "marks": [("O=C1C=CC([CH3])C(C)=C1", "a")],
    },
    # Dexamethason: 9-Fluor und 16-Methyl gegenüber Prednisolon.
    "dexamethason": {
        "smiles": "C[C@@H]1C[C@H]2[C@@H]3CCC4=CC(=O)C=C[C@@]4([C@]3([C@H](C[C@@]2([C@]1(C(=O)CO)O)C)O)F)C",
        "marks": [("[F]", "a"), ("[CH3;$([CH3][CH]([CH2])[C](O)C(=O)CO)]", "a")],
    },
    # Sucralfat: Saccharose-Octasulfat (das Aluminiumsalz hat keine einheitliche Einzelstruktur).
    "saccharose-octasulfat": {
        "smiles": "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)COS(=O)(=O)O)OS(=O)(=O)O)OS(=O)(=O)O)COS(=O)(=O)O)OS(=O)(=O)O)OS(=O)(=O)O)OS(=O)(=O)O)OS(=O)(=O)O",
        "marks": [("OS(=O)(=O)[OH]", "a")],
        "formula": "C12H22O35S8",
        "mass": 982.8,
    },
    # Salmeterol: Kopfgruppe (Saligenin) und lange fettliebende Seitenkette.
    "salmeterol": {
        "smiles": "C1=CC=C(C=C1)CCCCOCCCCCCNCC(C2=CC(=C(C=C2)O)CO)O",
        "marks": [("OCc1cc(C(O)CN)ccc1O", "a"), ("c1ccccc1CCCCOCCCCCC", "b")],
    },
    # Fluticasonpropionat: Thioester am C17 und Propionat.
    "fluticasonpropionat": {
        "smiles": "CCC(=O)O[C@@]1([C@@H](C[C@@H]2[C@@]1(C[C@@H]([C@]3([C@H]2C[C@@H](C4=CC(=O)C=C[C@@]43C)F)F)O)C)C)C(=O)SCF",
        "marks": [("C(=O)SCF", "a"), ("CCC(=O)O", "b")],
    },
    # Metamizol-Natrium: Methansulfonat-Gruppe, die im Körper abgespalten wird.
    "metamizol": {
        "smiles": "CC1=C(C(=O)N(N1C)C2=CC=CC=C2)N(C)CS(=O)(=O)[O-].[Na+]",
        "marks": [("CS(=O)(=O)[O-]", "a")],
        "formula": "C13H16N3NaO4S",
        "mass": 333.3,
    },
    # Metoclopramid: substituiertes Benzamid mit basischer Seitenkette.
    "metoclopramid": {
        "smiles": "CCN(CC)CCNC(=O)C1=CC(=C(C=C1OC)N)Cl",
        "marks": [("c1ccccc1C(=O)N", "a"), ("N(CC)(CC)CC", "b")],
    },
    # Maropitant: Chinuclidin-Gerüst.
    "maropitant": {
        "smiles": "CC(C)(C)C1=CC(=C(C=C1)OC)CN[C@@H]2[C@@H](N3CCC2CC3)C(C4=CC=CC=C4)C5=CC=CC=C5",
        "marks": [("C1CN2CCC1CC2", "a")],
    },
    # Butorphanol: Cyclobutylmethyl-Gruppe am Stickstoff.
    "butorphanol": {
        "smiles": "C1CC[C@]2([C@H]3CC4=C([C@]2(C1)CCN3CC5CCC5)C=C(C=C4)O)O",
        "marks": [("NCC1CCC1", "a")],
    },
    # Pimobendan: Pyridazinon-Ring.
    "pimobendan": {
        "smiles": "CC1CC(=O)NN=C1C2=CC3=C(C=C2)N=C(N3)C4=CC=C(C=C4)OC",
        "marks": [("C1CC(=O)NN=C1", "a")],
    },
    # Milbemycinoxim (A4-Oxim, Hauptbestandteil): Oxim-Gruppe.
    "milbemycinoxim": {
        "smiles": "CC[C@@H]1[C@H](CC[C@@]2(O1)C[C@@H]3C[C@H](O2)C/C=C(/C[C@H](/C=C/C=C/4\\CO[C@H]\\5[C@@]4([C@@H](C=C(/C5=N/O)C)C(=O)O3)O)C)\\C)C",
        "marks": [("C=N[OH]", "a")],
    },
    # Praziquantel.
    "praziquantel": {
        "smiles": "C1CCC(CC1)C(=O)N2CC3C4=CC=CC=C4CCN3C(=O)C2",
        "marks": [("C1CCCCC1C(=O)N", "a")],
    },
    # Moxidectin: Methoxim-Gruppe.
    "moxidectin": {
        "smiles": "C[C@@H]\\1C/C(=C/C[C@@H]2C[C@@H](C[C@@]3(O2)C/C(=N\\OC)/[C@@H]([C@H](O3)/C(=C/C(C)C)/C)C)OC(=O)[C@@H]4C=C([C@H]([C@@H]5[C@]4(/C(=C/C=C1)/CO5)O)O)C)/C",
        "marks": [("C=NOC", "a")],
    },
    # Imidacloprid: Nitroimin-Gruppe und Chlorpyridin.
    "imidacloprid": {
        "smiles": "C1CN(/C(=N/[N+](=O)[O-])/N1)CC2=CN=C(C=C2)Cl",
        "marks": [("N[N+](=O)[O-]", "a"), ("Clc1ncc(C)cc1", "b")],
    },
    # Bausteine der Infusionslösung.
    "acetat": {"smiles": "CC(=O)[O-]", "marks": [], "formula": "C2H3O2⁻", "mass": 59.0},
    "malat": {
        "smiles": "C([C@@H](C(=O)[O-])O)C(=O)[O-]",
        "marks": [],
        "formula": "C4H4O5²⁻",
        "mass": 132.1,
    },
    "natriumchlorid": {"smiles": "[Na+].[Cl-]", "marks": [], "formula": "NaCl", "mass": 58.4},
}

# Zuordnung der RDKit-Standardfarben zu Klassen.
PALETTE = {
    "000000": "",
    "0000FF": "n",
    "FF0000": "o",
    "CCCC00": "s",
    "00CC00": "x",  # Chlor
    "33CCCC": "x",  # Fluor
    "B2B200": "s",
    "FF8000": "p",
    "AB5CF2": "m",
    "7F7FFF": "m",
}


def hexcol(rgb: tuple[float, float, float]) -> str:
    return "".join(f"{int(round(c * 255)):02X}" for c in rgb)


HL_HEX = {hexcol(v): k for k, v in HL.items()}


def near(hex_a: str, hex_b: str, tol: int = 3) -> bool:
    a = [int(hex_a[i : i + 2], 16) for i in (0, 2, 4)]
    b = [int(hex_b[i : i + 2], 16) for i in (0, 2, 4)]
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def classify(hex_color: str) -> tuple[str, str]:
    """(Art, Klasse): Art ist 'hl' für Hervorhebung, sonst 'atom'."""
    h = hex_color.upper().lstrip("#")[:6]
    for k, v in HL_HEX.items():
        if near(h, k):
            return "hl", v
    if h in PALETTE:
        return "atom", PALETTE[h]
    raise ValueError(f"unbekannte Farbe {h}")


NUM = re.compile(r"-?\d+(?:\.\d+)?")


def fmt(v: float) -> str:
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def compact_path(d: str) -> str:
    out = []
    for tok in re.findall(r"[MLQZ]|-?\d+(?:\.\d+)?", d.replace(",", " ")):
        if tok in "MLQZ":
            out.append(tok)
        else:
            if out and out[-1] not in "MLQZ":
                out.append(" ")
            out.append(fmt(float(tok)))
    return "".join(out)


def style_of(el: ET.Element) -> dict[str, str]:
    st = {}
    for part in (el.get("style") or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            st[k.strip()] = v.strip()
    return st


def principal_rotation(mol: Chem.Mol) -> None:
    """Dreht die 2D-Koordinaten so, dass die längste Ausdehnung waagerecht liegt."""
    conf = mol.GetConformer()
    pts = [(conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y) for i in range(mol.GetNumAtoms())]
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    angle = 0.5 * math.atan2(2 * sxy, sxx - syy)
    c, s = math.cos(-angle), math.sin(-angle)
    for i, (x, y) in enumerate(pts):
        nx = (x - mx) * c - (y - my) * s
        ny = (x - mx) * s + (y - my) * c
        conf.SetAtomPosition(i, (nx, ny, 0.0))


def extent(mol: Chem.Mol) -> tuple[float, float]:
    conf = mol.GetConformer()
    xs = [conf.GetAtomPosition(i).x for i in range(mol.GetNumAtoms())]
    ys = [conf.GetAtomPosition(i).y for i in range(mol.GetNumAtoms())]
    return max(xs) - min(xs), max(ys) - min(ys)


def draw(spec: dict) -> dict:
    mol = Chem.MolFromSmiles(spec["smiles"])
    if mol is None:
        raise ValueError(f"SMILES nicht lesbar: {spec['smiles']}")
    rdDepictor.SetPreferCoordGen(True)
    rdDepictor.Compute2DCoords(mol)
    principal_rotation(mol)

    atoms: dict[str, set[int]] = {"a": set(), "b": set()}
    bonds: dict[str, set[int]] = {"a": set(), "b": set()}
    for smarts, key in spec.get("marks", []):
        patt = Chem.MolFromSmarts(smarts)
        if patt is None:
            raise ValueError(f"SMARTS nicht lesbar: {smarts}")
        found = mol.GetSubstructMatches(patt)
        if not found:
            raise ValueError(f"keine Übereinstimmung für {smarts} in {spec['smiles']}")
        for match in found[:1] if "[F]" not in smarts else found:
            ms = set(match)
            atoms[key] |= ms
            for b in mol.GetBonds():
                if b.GetBeginAtomIdx() in ms and b.GetEndAtomIdx() in ms:
                    bonds[key].add(b.GetIdx())

    dx, dy = extent(mol)
    width = 560
    ratio = (dy + 2.4) / (dx + 2.4)
    height = int(max(230, min(520, width * ratio)))

    d = rdMolDraw2D.MolDraw2DSVG(width, height)
    o = d.drawOptions()
    o.padding = 0.04
    o.fixedBondLength = BOND_LENGTH
    o.bondLineWidth = 2.4
    o.fillHighlights = True
    o.setBackgroundColour((1, 1, 1, 0))
    hl_atoms = sorted(atoms["a"] | atoms["b"])
    hl_bonds = sorted(bonds["a"] | bonds["b"])
    atom_colors = {i: HL["a"] if i in atoms["a"] else HL["b"] for i in hl_atoms}
    bond_colors = {i: HL["a"] if i in bonds["a"] else HL["b"] for i in hl_bonds}
    d.DrawMolecule(mol, highlightAtoms=hl_atoms, highlightBonds=hl_bonds, highlightAtomColors=atom_colors, highlightBondColors=bond_colors)
    d.FinishDrawing()
    # Zeichenfläche auf das Molekül zuschneiden: Kleine Moleküle behalten die Bindungslänge der großen
    # und stehen nicht mehr auf einer fast leeren Fläche.
    pts = [d.GetDrawCoords(i) for i in range(mol.GetNumAtoms())]
    vx0 = max(0.0, min(p.x for p in pts) - CROP_MARGIN)
    vx1 = min(float(width), max(p.x for p in pts) + CROP_MARGIN)
    vy0 = max(0.0, min(p.y for p in pts) - CROP_MARGIN)
    vy1 = min(float(height), max(p.y for p in pts) + CROP_MARGIN)
    raw = d.GetDrawingText()
    raw = re.sub(r"^<\?xml[^>]*\?>\s*", "", raw)
    raw = raw.replace("xmlns:rdkit='http://www.rdkit.org/xml'", "").replace("xmlns:xlink='http://www.w3.org/1999/xlink'", "")
    root = ET.fromstring(raw)
    ns = "{http://www.w3.org/2000/svg}"

    hl_shapes: list[str] = []
    bond_shapes: list[str] = []
    atom_shapes: list[str] = []
    widths: dict[str, int] = {}
    for el in root.iter():
        tag = el.tag.replace(ns, "")
        if tag not in ("path", "ellipse"):
            continue
        st = style_of(el)
        if tag == "ellipse":
            kind, cls = classify(st.get("fill", "#000000"))
            hl_shapes.append(f"<ellipse class='h{cls}' cx='{fmt(float(el.get('cx')))}' cy='{fmt(float(el.get('cy')))}' rx='{fmt(float(el.get('rx')))}' ry='{fmt(float(el.get('ry')))}'/>")
            continue
        dd = compact_path(el.get("d") or "")
        if not dd:
            continue
        if el.get("fill") is not None and not st:
            # Buchstabe einer Atombeschriftung
            kind, cls = classify(el.get("fill"))
            atom_shapes.append(f"<path{(' class=' + chr(39) + cls + chr(39)) if cls else ''} d='{dd}'/>")
            continue
        fill = st.get("fill", "none")
        stroke = st.get("stroke", "#000000")
        sw = st.get("stroke-width", "0px").replace("px", "")
        if fill != "none":
            kind, cls = classify(fill)
            if kind == "hl":
                hl_shapes.append(f"<path class='h{cls}' d='{dd}'/>")
            else:
                bond_shapes.append(f"<path class='w{(' ' + cls) if cls else ''}' d='{dd}'/>")
        else:
            kind, cls = classify(stroke)
            widths[sw] = widths.get(sw, 0) + 1
            classes = " ".join(c for c in (cls, "th" if sw not in ("2.4", "") and float(sw or 0) < 2 else "") if c)
            bond_shapes.append(f"<path{(' class=' + chr(39) + classes + chr(39)) if classes else ''} d='{dd}'/>")

    svg = f"<svg viewBox='{fmt(vx0)} {fmt(vy0)} {fmt(vx1 - vx0)} {fmt(vy1 - vy0)}' class='mol' role='img' focusable='false'>"
    if hl_shapes:
        svg += "<g class='hl'>" + "".join(hl_shapes) + "</g>"
    svg += "<g class='b'>" + "".join(bond_shapes) + "</g><g class='t'>" + "".join(atom_shapes) + "</g></svg>"

    formula = spec.get("formula") or rdMolDescriptors.CalcMolFormula(mol)
    mass = spec.get("mass") or round(Descriptors.MolWt(mol), 1)
    return {"svg": svg, "formula": formula, "mass": mass}


def lattice() -> dict:
    """Ausschnitt aus dem Natriumchlorid-Kristall: Natrium- und Chlorid-Ionen wechseln sich ab.

    Das Chlorid-Ion (Radius 181 pm) ist deutlich größer als das Natrium-Ion (102 pm). Gezeichnet ist ein
    auseinandergezogenes Raster, damit die Ionen einzeln erkennbar bleiben.
    """
    cols, rows, step = 5, 3, 98
    width, height = 560, 300
    x0 = (width - (cols - 1) * step) / 2
    y0 = (height - (rows - 1) * step) / 2
    r_cl, r_na = 36, 22
    hl: list[str] = []
    bonds: list[str] = []
    labels: list[str] = []
    for r in range(rows):
        for c in range(cols):
            x, y = x0 + c * step, y0 + r * step
            is_cl = (r + c) % 2 == 0
            rad = r_cl if is_cl else r_na
            hl.append(f"<circle class='h{'b' if is_cl else 'a'}' cx='{fmt(x)}' cy='{fmt(y)}' r='{rad}'/>")
            labels.append(f"<text x='{fmt(x)}' y='{fmt(y + 1)}'>{'Cl⁻' if is_cl else 'Na⁺'}</text>")
            for dx, dy, ok in ((step, 0, c < cols - 1), (0, step, r < rows - 1)):
                if not ok:
                    continue
                nx, ny = x + dx, y + dy
                n_cl = ((r + (dy > 0)) + (c + (dx > 0))) % 2 == 0
                r2 = r_cl if n_cl else r_na
                ax, ay = x + (rad if dx else 0), y + (rad if dy else 0)
                bx, by = nx - (r2 if dx else 0), ny - (r2 if dy else 0)
                bonds.append(f"<path class='th' d='M{fmt(ax)} {fmt(ay)}L{fmt(bx)} {fmt(by)}'/>")
    svg = (
        f"<svg viewBox='0 0 {width} {height}' class='mol' role='img' focusable='false'>"
        f"<g class='hl'>{''.join(hl)}</g><g class='b'>{''.join(bonds)}</g><g class='tx'>{''.join(labels)}</g></svg>"
    )
    return {"svg": svg, "formula": "NaCl", "mass": 58.4}


def main() -> int:
    out = {}
    for key, spec in MOLECULES.items():
        out[key] = lattice() if key == "natriumchlorid" else draw(spec)
        print(f"{key:24s} {len(out[key]['svg']):6d} Zeichen  {out[key]['formula']}  {out[key]['mass']}")
    lines = [
        "// Erzeugt mit tools/make-structures.py (RDKit, Strukturen aus PubChem). Nicht von Hand ändern.",
        "",
        "export interface Structure {",
        "  svg: string;",
        "  formula: string;",
        "  mass: number;",
        "}",
        "",
        "export const STRUCTURES: Record<string, Structure> = " + json.dumps(out, ensure_ascii=False, indent=2) + ";",
        "",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"geschrieben: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
