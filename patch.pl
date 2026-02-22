use strict; use warnings;

my $path = '/mnt/data/work/src/App.vue';
open my $fh, '<', $path or die $!;
local $/; my $s = <$fh>; close $fh;

my $new_tile = <<'CSS';
.tetrTile{
  /* Big, uniform tile sizing (AAA menu feel) */
  height: clamp(120px, 18vh, 190px);
  flex: 0 0 auto;

  /* Per-tile accent colors (overridden by accent classes below) */
  --c1: 0,229,255;   /* cyan */
  --c2: 255,43,214;  /* magenta */
  --c3: 255,215,0;   /* gold */

  /* AAA "off-panel" illusion (Valorant/TETR style):
     Make each tile *wider than its panel* and offset it so its far/right edge is always off-screen.
     This also prevents a visible gap on hover when the tile slides left. */
  --tetrOverhang: clamp(260px, 26vw, 560px);
  width: calc(100% + var(--tetrOverhang));
  margin-right: calc(var(--tetrOverhang) * -1);

  position: relative;
  text-align:left;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;

  /* Rich, colorful glass (keeps readability while feeling "Pentomino-colorful") */
  background:
    radial-gradient(1200px 420px at 16% 0%, rgba(255,255,255,.06), transparent 55%),
    radial-gradient(900px 360px at 18% 12%, rgba(var(--c1), .22), transparent 62%),
    radial-gradient(900px 360px at 58% 92%, rgba(var(--c2), .18), transparent 64%),
    radial-gradient(760px 320px at 92% 18%, rgba(var(--c3), .12), transparent 58%),
    linear-gradient(180deg, rgba(0,0,0,.52), rgba(0,0,0,.32));
  padding: 0;
  cursor: pointer;

  /* Keep inner VFX inside the tile, but shadows still render outside */
  overflow: hidden;

  box-shadow:
    0 14px 40px rgba(0,0,0,.58),
    0 0 0 1px rgba(0,0,0,0.35) inset,
    0 0 18px rgba(var(--c1), .10),
    0 0 18px rgba(var(--c2), .08);

  transition:
    transform .28s cubic-bezier(.2,.85,.2,1),
    box-shadow .28s cubic-bezier(.2,.85,.2,1),
    filter .28s cubic-bezier(.2,.85,.2,1);
}
.tetrTile:before{
CSS

$s =~ s{\.tetrTile\{[\s\S]*?\n\}\n\.tetrTile:before\{}{$new_tile}s;

$s =~ s{/\* Subtle glass \+ diagonal sheen \*/\s*background:\s*[\s\S]*?\s*opacity:\s*\.70;}{/* Subtle glass + diagonal sheen */
  background:
    linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,0) 52%),
    radial-gradient(1100px 360px at 12% 10%, rgba(var(--c1),0.26), transparent 62%),
    radial-gradient(980px 340px at 54% 92%, rgba(var(--c2),0.22), transparent 64%),
    radial-gradient(820px 320px at 92% 18%, rgba(var(--c3),0.16), transparent 60%),
    radial-gradient(900px 300px at 30% 50%, rgba(255,255,255,0.06), transparent 65%);

  opacity: .78;}s;

$s =~ s{\.tetrTile:after\{\s*content:"";\s*position:absolute;\s*inset:0;\s*pointer-events:none;\s*border-radius: inherit;\s*\n\n\s*background:\s*[\s\S]*?\n\s*mix-blend-mode: screen;\s*opacity: \.18;}{.tetrTile:after{
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
  opacity: .20;}s;

$s =~ s{\.tetrTile:hover\{\s*transform: translateX\(-34px\);\s*box-shadow:\s*[\s\S]*?filter: brightness\(1\.08\) saturate\(1\.04\);\s*\}}{.tetrTile:hover{
  transform: translateX(-34px);
  box-shadow:
    0 18px 55px rgba(0,0,0,.62),
    0 0 0 1px rgba(var(--c1),0.10) inset,
    0 0 0 1px rgba(var(--c2),0.08),
    0 0 26px rgba(var(--c1),0.14),
    0 0 22px rgba(var(--c2),0.10);
  filter: brightness(1.10) saturate(1.18);
}}s;

sub set_accent {
  my ($cls,$c1,$c2,$c3,$txt) = @_;
  my $rep1 = ".tetrTile.$cls{\n  --c1: $c1;\n  --c2: $c2;\n  --c3: $c3;\n  box-shadow: 0 0 0 1px rgba($c2,0.10) inset;\n}";
  $s =~ s{\.tetrTile\.$cls\{\s*box-shadow:[^;]*;\s*\}}{$rep1}s;

  my $rep2 = ".tetrTile.$cls .tetrTileGlyph,\n.tetrTile.$cls .tetrTileTitle{\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: $txt;\n  text-shadow: 0 10px 28px rgba(0,0,0,0.55), 0 0 18px rgba($c2,0.10);\n}";
  $s =~ s{\.tetrTile\.$cls \.tetrTileGlyph,\s*\n\.tetrTile\.$cls \.tetrTileTitle\{[\s\S]*?color:[^;]*;\s*\}}{$rep2}s;
}

set_accent('accentPink','255,60,210','255,155,60','0,240,255','rgba(255,200,235,0.98)');
set_accent('accentPurple','160,120,255','0,229,255','255,215,0','rgba(230,215,255,0.98)');
set_accent('accentPurple2','120,110,255','255,43,214','0,229,255','rgba(220,205,255,0.98)');
set_accent('accentBlue','0,200,255','80,255,160','255,215,0','rgba(205,235,255,0.98)');

if ($s =~ /\.tetrTile\.accentGrey\{/){
  $s =~ s{\.tetrTile\.accentGrey\{[\s\S]*?\}}{.tetrTile.accentGrey{\n  --c1: 160,160,170;\n  --c2: 0,229,255;\n  --c3: 255,43,214;\n  box-shadow: 0 0 0 1px rgba(255,255,255,0.10) inset;\n}}s;
  $s =~ s{\.tetrTile\.accentGrey \.tetrTileGlyph,\s*\n\.tetrTile\.accentGrey \.tetrTileTitle\{[\s\S]*?\}}{.tetrTile.accentGrey .tetrTileGlyph,\n.tetrTile.accentGrey .tetrTileTitle{\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: rgba(235,235,245,0.96);\n  text-shadow: 0 10px 28px rgba(0,0,0,0.55), 0 0 18px rgba(255,255,255,0.10);\n}}s;
}

open my $out, '>', $path or die $!;
print $out $s;
close $out;
print "patched\n";
