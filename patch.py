import re
from pathlib import Path
path = Path('/mnt/data/work/src/App.vue')
s = path.read_text(encoding='utf-8')

new_tile = """.tetrTile{\n  /* Big, uniform tile sizing (AAA menu feel) */\n  height: clamp(120px, 18vh, 190px);\n  flex: 0 0 auto;\n\n  /* Per-tile accent colors (overridden by accent classes below) */\n  --c1: 0,229,255;   /* cyan */\n  --c2: 255,43,214;  /* magenta */\n  --c3: 255,215,0;   /* gold */\n\n  /* AAA \"off-panel\" illusion (Valorant/TETR style):\n     Make each tile *wider than its panel* and offset it so its far/right edge is always off-screen.\n     This also prevents a visible gap on hover when the tile slides left. */\n  --tetrOverhang: clamp(260px, 26vw, 560px);\n  width: calc(100% + var(--tetrOverhang));\n  margin-right: calc(var(--tetrOverhang) * -1);\n\n  position: relative;\n  text-align:left;\n  border: 1px solid rgba(255,255,255,0.12);\n  border-radius: 14px;\n\n  /* Rich, colorful glass (keeps readability while feeling \"Pentomino-colorful\") */\n  background:\n    radial-gradient(1200px 420px at 16% 0%, rgba(255,255,255,.06), transparent 55%),\n    radial-gradient(900px 360px at 18% 12%, rgba(var(--c1), .22), transparent 62%),\n    radial-gradient(900px 360px at 58% 92%, rgba(var(--c2), .18), transparent 64%),\n    radial-gradient(760px 320px at 92% 18%, rgba(var(--c3), .12), transparent 58%),\n    linear-gradient(180deg, rgba(0,0,0,.52), rgba(0,0,0,.32));\n  padding: 0;\n  cursor: pointer;\n\n  /* Keep inner VFX inside the tile, but shadows still render outside */\n  overflow: hidden;\n\n  box-shadow:\n    0 14px 40px rgba(0,0,0,.58),\n    0 0 0 1px rgba(0,0,0,0.35) inset,\n    0 0 18px rgba(var(--c1), .10),\n    0 0 18px rgba(var(--c2), .08);\n\n  transition:\n    transform .28s cubic-bezier(.2,.85,.2,1),\n    box-shadow .28s cubic-bezier(.2,.85,.2,1),\n    filter .28s cubic-bezier(.2,.85,.2,1);\n}\n.tetrTile:before{"""

s, n = re.subn(r"\.tetrTile\{\s*[\s\S]*?\n\}\n\.tetrTile:before\{", new_tile, s, count=1)
assert n == 1, 'tetrTile block not replaced'

s, n = re.subn(
    r"/\* Subtle glass \+ diagonal sheen \*/\s*background:\s*[\s\S]*?\s*opacity:\s*\.70;",
    """/* Subtle glass + diagonal sheen */
  background:
    linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,0) 52%),
    radial-gradient(1100px 360px at 12% 10%, rgba(var(--c1),0.26), transparent 62%),
    radial-gradient(980px 340px at 54% 92%, rgba(var(--c2),0.22), transparent 64%),
    radial-gradient(820px 320px at 92% 18%, rgba(var(--c3),0.16), transparent 60%),
    radial-gradient(900px 300px at 30% 50%, rgba(255,255,255,0.06), transparent 65%);

  opacity: .78;""",
    s,
    count=1,
)
assert n == 1, ':before background not replaced'

pattern_after = r"\.tetrTile:after\{\s*content:\"\";\s*position:absolute;\s*inset:0;\s*pointer-events:none;\s*border-radius: inherit;\s*\n\n\s*background:\s*[\s\S]*?\n\s*mix-blend-mode: screen;\s*opacity: \.18;"

s, n = re.subn(
    pattern_after,
    """.tetrTile:after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius: inherit;

  /* Neon edge + rainbow scan shimmer */
  background:
    linear-gradient(90deg,
      rgba(var(--c1),0.26),
      rgba(var(--c2),0.22) 48%,
      rgba(var(--c3),0.18) 78%,
      rgba(255,255,255,0.06)
    ),
    repeating-linear-gradient(
      180deg,
      rgba(255,255,255,0.07) 0px,
      rgba(255,255,255,0.07) 1px,
      rgba(255,255,255,0) 6px,
      rgba(255,255,255,0) 10px
    );
  mix-blend-mode: screen;
  opacity: .20;""",
    s,
    count=1,
)
assert n == 1, ':after block not replaced'

s, n = re.subn(
    r"\.tetrTile:hover\{\s*transform: translateX\(-34px\);\s*box-shadow:\s*[\s\S]*?filter: brightness\(1\.08\) saturate\(1\.04\);\s*\}",
    """.tetrTile:hover{
  transform: translateX(-34px);
  box-shadow:
    0 18px 55px rgba(0,0,0,.62),
    0 0 0 1px rgba(var(--c1),0.10) inset,
    0 0 0 1px rgba(var(--c2),0.08),
    0 0 26px rgba(var(--c1),0.14),
    0 0 22px rgba(var(--c2),0.10);
  filter: brightness(1.10) saturate(1.18);
}""",
    s,
    count=1,
)
assert n == 1, 'hover not replaced'


def set_accent(s: str, cls: str, c1: str, c2: str, c3: str, txt: str) -> str:
    s = re.sub(
        rf"\.tetrTile\.{re.escape(cls)}\{{\s*box-shadow:[^;]*;\s*\}}",
        f""".tetrTile.{cls}{{
  --c1: {c1};
  --c2: {c2};
  --c3: {c3};
  box-shadow: 0 0 0 1px rgba({c2},0.10) inset;
}}""",
        s,
        count=1,
    )
    s = re.sub(
        rf"\.tetrTile\.{re.escape(cls)} \.tetrTileGlyph,\s*\n\.tetrTile\.{re.escape(cls)} \.tetrTileTitle\{{[\s\S]*?color:[^;]*;\s*\}}",
        f""".tetrTile.{cls} .tetrTileGlyph,
.tetrTile.{cls} .tetrTileTitle{{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: {txt};
  text-shadow: 0 10px 28px rgba(0,0,0,0.55), 0 0 18px rgba({c2},0.10);
}}""",
        s,
        count=1,
    )
    return s

s = set_accent(s,'accentPink','255,60,210','255,155,60','0,240,255','rgba(255,200,235,0.98)')
s = set_accent(s,'accentPurple','160,120,255','0,229,255','255,215,0','rgba(230,215,255,0.98)')
s = set_accent(s,'accentPurple2','120,110,255','255,43,214','0,229,255','rgba(220,205,255,0.98)')
s = set_accent(s,'accentBlue','0,200,255','80,255,160','255,215,0','rgba(205,235,255,0.98)')

if '.tetrTile.accentGrey' in s:
    s = re.sub(
        r"\.tetrTile\.accentGrey\{[\s\S]*?\}",
        """.tetrTile.accentGrey{
  --c1: 160,160,170;
  --c2: 0,229,255;
  --c3: 255,43,214;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.10) inset;
}""",
        s,
        count=1,
    )
    s = re.sub(
        r"\.tetrTile\.accentGrey \.tetrTileGlyph,\s*\n\.tetrTile\.accentGrey \.tetrTileTitle\{[\s\S]*?\}",
        """.tetrTile.accentGrey .tetrTileGlyph,
.tetrTile.accentGrey .tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(235,235,245,0.96);
  text-shadow: 0 10px 28px rgba(0,0,0,0.55), 0 0 18px rgba(255,255,255,0.10);
}""",
        s,
        count=1,
    )

path.write_text(s, encoding='utf-8')
print('patched OK')
