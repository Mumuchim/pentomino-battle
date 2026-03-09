/**
 * PentoBattle AI Engine v6.1 — POST-MORTEM PATCH
 * Based on v5.0 "ZERO" + v4.2 Legacy Systems
 *
 * NEW in v6.1 (post-mortem fixes):
 * - FIX A: Joint Feasibility Check in endgameSolve — solveTiling() now validates
 *   that placing a candidate move leaves ALL remaining pieces packable together
 *   (not just individually). Eliminates the "U and W both fit independently but
 *   not simultaneously" failure that caused both recorded losses.
 * - FIX B: Shape-Aware Leaf Survival — _fastLeafSurvival() now uses actual
 *   pieceCanFitInRegion() for U, W, X, F instead of the bounding-box shortcut,
 *   which was giving false confidence for irregular shapes.
 * - FIX C: Proactive Hard-Piece Urgency — TRICKY_PIECES (X, U, W, F) receive a
 *   score boost in movesLegendary beam selection proportional to how few placements
 *   they have left, ensuring they are front-loaded before board fragmentation.
 * - FIX D: SHAPE_SCORE corrected — U downgraded from 5 to 3 (matching W/X tier)
 *   to prevent the draft engine over-valuing irregular, hard-to-place pieces.
 * - FIX E: endgameSolve now includes opponent lookahead for 'ultimate' difficulty
 *   (previously silently skipped — only ran for expert/master).
 * - FIX F: godDraftScore BLOCKER cap — hard penalty for drafting 2+ BLOCKER pieces
 *   in the same hand, applied consistently in the ultimate/god draft path.
 *
 * Preserved from v5.0:
 * - Mathematical Parity Dead-Zone Detection
 * - 7-ply Deep Alpha-Beta with Zobrist TT + killer heuristic
 * - Unique Cavity Banking, Anti-Bulky Drafting
 * - All territory-planning, fork detection, articulation-point systems
 */

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

const PIECE_ROLES = {
  FLEXIBLE: new Set(['P','L','N','T','Y']),
  LINEAR:   new Set(['I']),
  FILLER:   new Set(['Z']),
  BLOCKER:  new Set(['X','W','F','U']),
  COMPACT:  new Set(['P','U']), // New role: Fits in 3x2/2x3
  BULKY:    new Set(['I','L','N','Y','T','Z']) // Requires 4x2, 5x1, or 3x3
};

const VERSATILE_PIECES = new Set(['I','L','T','Y','N','Z','P']);
const TRICKY_PIECES    = new Set(['F','W','X','U','V']);
const UNPAIRABLE       = new Set(['X','W','F','U']);

// FIX D: U downgraded 5→3, F downgraded 4→3 — placement difficulty now reflected
const SHAPE_SCORE = { I:5, L:4, Y:4, N:4, T:4, Z:4, P:5, U:3, W:3, F:3, X:3, V:2 };

const SYNERGY_PAIRS = {
  P: ['Z','L','N'], Z: ['P'],
  L: ['P','N'],     N: ['P','L'],
  I: ['L','Y','N','Z','U','V'], T: ['Y'], Y: ['T','N'],
  U: ['I','V'],
  V: ['I','U'],
};

// ─────────────────────────────────────────────────────────────────
//  BOARD UTILITIES
// ─────────────────────────────────────────────────────────────────

function parityImbalance(cells) {
  let b = 0, w = 0;
  for (const [x,y] of cells) (x+y)%2===0 ? b++ : w++;
  return Math.abs(b-w);
}

// ─────────────────────────────────────────────────────────────────
//  V5.0 — MATHEMATICAL PARITY DEAD-ZONE DETECTION
// ─────────────────────────────────────────────────────────────────

/**
 * Determines whether a region is a "Dead Zone" using checkerboard parity math.
 *
 * Every pentomino placed on a checkerboard covers exactly 3 cells of one colour
 * and 2 of the other, so it always shifts the black/white balance by ±1.
 * For a region of size 5k to be fully tiled by k pentominoes:
 *   1. |black − white| ≤ k                    (balance reachable)
 *   2. |black − white| ≡ k  (mod 2)           (parity achievable)
 * If either condition fails, tiling is mathematically impossible regardless of
 * piece shapes — this is a Dead Zone.
 *
 * Returns a positive penalty score (higher = worse dead zone for the opponent).
 */
function getParityDeadZoneScore(region) {
  if (!region || region.length === 0) return 0;
  let b = 0, w = 0;
  for (const [x, y] of region) (x + y) % 2 === 0 ? b++ : w++;
  const diff   = Math.abs(b - w);
  const size   = region.length;
  const k      = Math.floor(size / 5);          // max pentominoes that fit by size
  const excess = size % 5;                       // leftover cells (already infeasible if >0)

  // Region not a multiple of 5 → trivially infeasible (already handled elsewhere),
  // but parity compounds the penalty.
  if (excess !== 0) return diff * 28 + excess * 18;

  // Condition 1: balance unreachable
  const balanceFail  = diff > k;
  // Condition 2: parity mismatch  (diff and k must have same parity)
  const parityFail   = (diff % 2) !== (k % 2);

  if (balanceFail || parityFail) {
    // Severity scales with region size and how "wrong" the balance is
    const severity = balanceFail ? (diff - k) * 40 : 30;
    return severity + diff * 22 + size * 4;
  }
  return 0;
}

/**
 * Scans all empty regions on the simulated board and returns the total dead-zone
 * penalty score.  Regions adjacent only to AI cells are counted as AI-favourable
 * dead zones (opponent cannot exploit them) — those are actually a bonus so we
 * return net score = human-adjacent dead zones − ai-adjacent dead zones.
 */
function boardParityDeadZoneScore(simBoard, W, H, ap, hp) {
  const regions = floodFillRegions(simBoard, W, H);
  let hpDeadPenalty = 0;
  let aiDeadPenalty = 0;

  for (const reg of regions) {
    const dz = getParityDeadZoneScore(reg);
    if (dz === 0) continue;

    let adjAI = false, adjHP = false;
    outer: for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const p = simBoard[ny][nx]?.player;
        if (p === ap) adjAI = true;
        if (p === hp) adjHP = true;
        if (adjAI && adjHP) break outer;
      }
    }
    // Dead zone touching only AI → AI owns it, good for AI
    if (adjAI && !adjHP) aiDeadPenalty += dz;
    // Dead zone touching only HP → HP is trapped, good for AI
    if (adjHP && !adjAI) hpDeadPenalty += dz;
    // Mixed adjacency → partial credit
    if (adjAI && adjHP) hpDeadPenalty += dz * 0.4;
  }
  // Net: positive = good for AI (HP is stuck in dead zones, AI is not)
  return hpDeadPenalty - aiDeadPenalty * 0.3;
}

function floodFillRegions(board, W, H) {
  const visited = new Set();
  const regions = [];
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    const k=y*W+x;
    if (board[y][x]!==null||visited.has(k)) continue;
    const region=[]; const q=[[x,y]]; let qi=0; visited.add(k);
    while(qi<q.length){
      const[cx,cy]=q[qi++]; region.push([cx,cy]);
      for(const[ox,oy]of DIRS){
        const nx=cx+ox,ny=cy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const nk=ny*W+nx;
        if(board[ny][nx]===null&&!visited.has(nk)){visited.add(nk);q.push([nx,ny]);}
      }
    }
    regions.push(region);
  }
  return regions;
}

function voronoiTerritory(board, W, H, ap, hp) {
  function distFrom(player){
    const dist=new Array(H*W).fill(Infinity); const q=[]; let qi=0;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      if(board[y][x]?.player!==player) continue;
      const k=y*W+x; dist[k]=0; q.push([x,y]);
    }
    while(qi<q.length){
      const[cx,cy]=q[qi++]; const cd=dist[cy*W+cx];
      for(const[ox,oy]of DIRS){
        const nx=cx+ox,ny=cy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H||board[ny][nx]!==null) continue;
        const nk=ny*W+nx;
        if(dist[nk]===Infinity){dist[nk]=cd+1;q.push([nx,ny]);}
      }
    }
    return dist;
  }
  const da=distFrom(ap), dh=distFrom(hp);
  let aT=0,hT=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(board[y][x]!==null) continue;
    const k=y*W+x,a=da[k],h=dh[k];
    if(!isFinite(a)&&!isFinite(h)) continue;
    if(a<h) aT++; else if(h<a) hT++; else{aT+=0.5;hT+=0.5;}
  }
  return{ap:aT,hp:hT};
}

function territoryAdvantage(board,W,H,ap,hp){
  const t=voronoiTerritory(board,W,H,ap,hp); return t.ap-t.hp;
}

function regionFeasibilityBonus(regions,board,W,H,hp){
  let bonus=0;
  for(const reg of regions){
    const sz=reg.length; if(!sz) continue;
    const infeasible=sz%5!==0, imbalance=parityImbalance(reg), parityBad=imbalance>0;
    if(!infeasible&&!parityBad) continue;
    let touchesOpp=false;
    outer:for(const[cx,cy]of reg) for(const[ox,oy]of DIRS){
      const nx=cx+ox,ny=cy+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(board[ny][nx]?.player===hp){touchesOpp=true;break outer;}
    }
    if(!touchesOpp) continue;
    if(infeasible) bonus+=(sz%5)*12;
    if(parityBad)  bonus+=(imbalance%2===1?imbalance*10:imbalance*4);
    if(sz<=4)      bonus+=(5-sz)*8;
  }
  return bonus;
}

function frontierScore(simBoard,W,H,ap,hp){
  let net=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(simBoard[y][x]!==null) continue;
    let aiT=0,hpT=0;
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const p=simBoard[ny][nx]?.player;
      if(p===ap) aiT++; else if(p===hp) hpT++;
    }
    if(!aiT&&!hpT) continue;
    net+=Math.max(-2,Math.min(2,aiT-hpT));
  }
  return net*3;
}

function zoneSealBonus(regions,board,simBoard,W,H,hp){
  let bonus=0;
  for(const reg of regions){
    if(reg.length<5) continue;
    let oppCanReach=false,oppWasBefore=false;
    for(const[cx,cy]of reg) for(const[ox,oy]of DIRS){
      const nx=cx+ox,ny=cy+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(simBoard[ny][nx]?.player===hp) oppCanReach=true;
      if(board[ny][nx]?.player===hp)   oppWasBefore=true;
    }
    if(oppWasBefore&&!oppCanReach) bonus+=reg.length*9;
  }
  return bonus;
}

function pieceEfficiencyScore(abs,simBoard,W,H,ap){
  let score=0;
  for(const[x,y]of abs){
    if(x===0||x===W-1) score+=0.8;
    if(y===0||y===H-1) score+=0.8;
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(simBoard[ny][nx]?.player===ap) score+=0.5;
    }
  }
  for(const[x,y]of abs) for(const[ox,oy]of DIRS){
    const nx=x+ox,ny=y+oy;
    if(nx<0||ny<0||nx>=W||ny>=H||simBoard[ny][nx]!==null) continue;
    let emptyN=0;
    for(const[ox2,oy2]of DIRS){
      const nnx=nx+ox2,nny=ny+oy2;
      if(nnx<0||nny<0||nnx>=W||nny>=H) continue;
      if(simBoard[nny][nnx]===null) emptyN++;
    }
    if(emptyN===0) score-=8; else if(emptyN===1) score-=2;
  }
  return score*5;
}

function aiClusterPenalty(simBoard,W,H,ap){
  const aiCells=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(simBoard[y][x]?.player===ap) aiCells.push([x,y]);
  if(!aiCells.length) return 0;
  const visited=new Set(); let largestSize=0;
  for(const[sx,sy]of aiCells){
    const k0=sy*W+sx; if(visited.has(k0)) continue;
    const q=[[sx,sy]]; visited.add(k0); let size=0,qi=0;
    while(qi<q.length){
      const[cx,cy]=q[qi++]; size++;
      for(const[ox,oy]of DIRS){
        const nx=cx+ox,ny=cy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const nk=ny*W+nx;
        if(simBoard[ny][nx]?.player===ap&&!visited.has(nk)){visited.add(nk);q.push([nx,ny]);}
      }
    }
    if(size>largestSize) largestSize=size;
  }
  const stranded=aiCells.length-largestSize;
  return stranded>0?-(stranded*25):0;
}

function openTerritoryBonus(abs,simBoard,W,H,ap,cachedRegions){
  const aiCells=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(simBoard[y][x]?.player===ap) aiCells.push([x,y]);
  const mainCluster=new Set();
  if(aiCells.length){
    const q=[aiCells[0]]; mainCluster.add(aiCells[0][1]*W+aiCells[0][0]); let qi=0;
    while(qi<q.length){
      const[cx,cy]=q[qi++];
      for(const[ox,oy]of DIRS){
        const nx=cx+ox,ny=cy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const nk=ny*W+nx;
        if(simBoard[ny][nx]?.player===ap&&!mainCluster.has(nk)){mainCluster.add(nk);q.push([nx,ny]);}
      }
    }
  }
  const regions=cachedRegions||floodFillRegions(simBoard,W,H);
  if(!regions.length) return 0;
  const nearAnchor=new Set();
  for(const k of mainCluster) nearAnchor.add(k);
  for(const[cx,cy]of abs) for(const[ox,oy]of DIRS){
    const nx=cx+ox,ny=cy+oy;
    if(nx>=0&&ny>=0&&nx<W&&ny<H) nearAnchor.add(ny*W+nx);
  }
  let bestRegion=null,bestSize=0;
  for(const reg of regions){
    if(reg.length<6) continue;
    if(!reg.some(([x,y])=>nearAnchor.has(y*W+x))) continue;
    if(reg.length>bestSize){bestSize=reg.length;bestRegion=reg;}
  }
  if(!bestRegion) return 0;
  const regSet=new Set(bestRegion.map(([x,y])=>y*W+x));
  let touchCount=0;
  for(const[x,y]of abs){
    if(regSet.has(y*W+x)){touchCount+=2;continue;}
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&regSet.has(ny*W+nx)){touchCount++;break;}
    }
  }
  return touchCount?Math.sqrt(bestSize)*touchCount*2.2:0;
}

// ─────────────────────────────────────────────────────────────────
//  TERRITORY PLANNING SYSTEM
// ─────────────────────────────────────────────────────────────────

function canTileZone(cells,hand,allowFlip,PENTS,xformFn,timeLimitMs=80){
  if(!cells.length||cells.length%5!==0) return{canTile:false,pieces:[]};
  const needed=cells.length/5;
  if(needed>hand.length) return{canTile:false,pieces:[]};
  const coordSet=new Set(cells.map(([x,y])=>y*1000+x));
  const DIRS4=[[1,0],[-1,0],[0,1],[0,-1]];
  const sorted=cells.slice().sort((a,b)=>{
    const ca=DIRS4.filter(([ox,oy])=>coordSet.has((a[1]+oy)*1000+(a[0]+ox))).length;
    const cb=DIRS4.filter(([ox,oy])=>coordSet.has((b[1]+oy)*1000+(b[0]+ox))).length;
    return ca-cb;
  });
  const flipOpts=allowFlip?[false,true]:[false];
  const deadline=Date.now()+timeLimitMs;
  const filled=new Set(),usedPieces=[],chosen=[];

  function firstUnfilled(){
    for(const[x,y]of sorted) if(!filled.has(y*1000+x)) return[x,y];
    return null;
  }
  function bt(depth){
    if(Date.now()>deadline) return'timeout';
    if(depth===needed) return filled.size===cells.length;
    const nxt=firstUnfilled(); if(!nxt) return false;
    const[tx,ty]=nxt;
    for(const pk of hand){
      if(usedPieces.indexOf(pk)!==-1) continue;
      for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=xformFn(PENTS[pk],rot,flip);
        for(const[ax,ay]of shape){
          const ox=tx-ax,oy=ty-ay;
          let valid=true; const placed=[];
          for(const[dx,dy]of shape){
            const key=(oy+dy)*1000+(ox+dx);
            if(!coordSet.has(key)||filled.has(key)){valid=false;break;}
            placed.push(key);
          }
          if(!valid) continue;
          usedPieces.push(pk);
          for(const k of placed) filled.add(k);
          chosen.push(pk);
          const r=bt(depth+1);
          if(r===true) return true;
          usedPieces.pop();
          for(const k of placed) filled.delete(k);
          chosen.pop();
          if(r==='timeout') return'timeout';
        }
      }
    }
    return false;
  }
  const r=bt(0);
  return r===true?{canTile:true,pieces:chosen.slice()}:{canTile:false,pieces:[]};
}

function generateRectZones(board,W,H,minSize,maxSize){
  const zones=[];
  for(let y0=0;y0<H;y0++) for(let x0=0;x0<W;x0++)
    for(let h=2;h<=H-y0;h++) for(let w=2;w<=W-x0;w++){
      const size=w*h;
      if(size<minSize||size>maxSize||size%5!==0) continue;
      let allEmpty=true; const cells=[];
      for(let dy=0;dy<h&&allEmpty;dy++) for(let dx=0;dx<w&&allEmpty;dx++){
        if(board[y0+dy][x0+dx]!==null){allEmpty=false;break;}
        cells.push([x0+dx,y0+dy]);
      }
      if(!allEmpty) continue;
      const walls=((x0===0)?1:0)+((x0+w===W)?1:0)+((y0===0)?1:0)+((y0+h===H)?1:0);
      const edgeScore=walls*8+(walls>=2?20:0);
      zones.push({cells,w,h,x0,y0,size,walls,edgeScore});
    }
  zones.sort((a,b)=>(b.edgeScore+b.size*0.5)-(a.edgeScore+a.size*0.5));
  return zones;
}

function findBestTerritoryZone(hand,board,W,H,ap,hp,allowFlip,PENTS,xformFn,budgetMs=200){
  if(!hand||hand.length<2) return null;
  const maxZoneSize=Math.min(Math.floor(W*H*0.5),hand.length*5);
  const candidates=generateRectZones(board,W,H,10,maxZoneSize);
  let bestPlan=null,bestScore=-Infinity;
  const deadline=Date.now()+budgetMs;
  for(const zone of candidates){
    if(Date.now()>deadline) break;
    if(zone.size/5>hand.length) continue;
    const r=canTileZone(zone.cells,hand,allowFlip,PENTS,xformFn,50);
    if(!r.canTile) continue;
    let score=zone.size*1.5+zone.edgeScore+(hand.length-zone.size/5)*4;
    let oppAdj=false;
    outer:for(const[x,y]of zone.cells) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(board[ny][nx]?.player===hp){oppAdj=true;break outer;}
    }
    if(oppAdj) score-=15;
    if(score>bestScore){
      bestScore=score;
      const cellSet=new Set(zone.cells.map(([x,y])=>y*W+x));
      bestPlan={...zone,cellSet,pieces:r.pieces,score,piecesNeeded:zone.size/5};
    }
  }
  return bestPlan;
}

function getZoneSealProgress(plan,board,W,H,ap){
  if(!plan) return{progress:0,isSealed:false};
  let sealedEdges=0,totalBorderEdges=0;
  for(const[x,y]of plan.cells) for(const[ox,oy]of DIRS){
    const nx=x+ox,ny=y+oy;
    if(plan.cellSet.has(ny*W+nx)) continue;
    totalBorderEdges++;
    if(nx<0||ny<0||nx>=W||ny>=H){sealedEdges++;continue;}
    if(board[ny][nx]?.player===ap) sealedEdges++;
  }
  const progress=totalBorderEdges>0?sealedEdges/totalBorderEdges:0;
  return{progress,sealedEdges,totalBorderEdges,isSealed:progress>=1.0};
}

function isZoneIntruded(plan,board,W,H,hp){
  if(!plan) return true;
  for(const[x,y]of plan.cells) if(board[y][x]?.player===hp) return true;
  return false;
}

function territoryPlanBonus(abs,plan,board,simBoard,W,H,ap,hp){
  if(!plan) return 0;
  const borderCellSet=new Set();
  for(const[x,y]of plan.cells) for(const[ox,oy]of DIRS){
    const nx=x+ox,ny=y+oy;
    if(nx<0||ny<0||nx>=W||ny>=H) continue;
    if(!plan.cellSet.has(ny*W+nx)) borderCellSet.add(ny*W+nx);
  }
  const preSeal=getZoneSealProgress(plan,board,W,H,ap);
  const postSeal=getZoneSealProgress(plan,simBoard,W,H,ap);
  let bonus=0;
  for(const[x,y]of abs){
    const key=y*W+x;
    if(plan.cellSet.has(key)) bonus+=preSeal.progress>=0.85?30:8;
    else if(borderCellSet.has(key)) bonus+=45;
    else for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(borderCellSet.has(ny*W+nx)){bonus+=10;break;}
    }
  }
  const sealImprovement=postSeal.progress-preSeal.progress;
  if(sealImprovement>0) bonus+=sealImprovement*plan.size*14;
  if(postSeal.isSealed&&!preSeal.isSealed) bonus+=plan.size*50;
  return bonus;
}

function predictOpponentZone(oppHand,board,W,H,ap,hp,allowFlip,PENTS,xformFn){
  if(!oppHand||oppHand.length<2) return null;
  return findBestTerritoryZone(oppHand,board,W,H,hp,ap,allowFlip,PENTS,xformFn,100);
}

function opponentZoneDisruptBonus(abs,oppPlan,W,H){
  if(!oppPlan) return 0;
  let bonus=0;
  for(const[x,y]of abs){
    if(oppPlan.cellSet.has(y*W+x)) bonus+=65;
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(oppPlan.cellSet.has(ny*W+nx)){bonus+=22;break;}
    }
  }
  return bonus;
}

// ─────────────────────────────────────────────────────────────────
//  OPPORTUNITY SCANNER
// ─────────────────────────────────────────────────────────────────

function largestPlayerCluster(board,W,H,player){
  const cells=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(board[y][x]?.player===player) cells.push([x,y]);
  if(!cells.length) return new Set();
  const visited=new Set(); let best=new Set();
  for(const[sx,sy]of cells){
    const k0=sy*W+sx; if(visited.has(k0)) continue;
    const comp=new Set(); const q=[[sx,sy]]; comp.add(k0); visited.add(k0); let qi=0;
    while(qi<q.length){
      const[cx,cy]=q[qi++];
      for(const[ox,oy]of DIRS){
        const nx=cx+ox,ny=cy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const nk=ny*W+nx;
        if(board[ny][nx]?.player===player&&!comp.has(nk)){comp.add(nk);visited.add(nk);q.push([nx,ny]);}
      }
    }
    if(comp.size>best.size) best=comp;
  }
  return best;
}

function findStrandedOpponentCells(board,W,H,hp){
  const main=largestPlayerCluster(board,W,H,hp);
  const stranded=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(board[y][x]?.player===hp&&!main.has(y*W+x)) stranded.push([x,y]);
  return stranded;
}

function scanOpportunities(board,W,H,ap,hp,aiHand,currentPlan,allowFlip,PENTS,xformFn){
  const regions=floodFillRegions(board,W,H);
  const exposedPockets=[];
  for(const reg of regions){
    const sz=reg.length;
    if(sz<3||sz>20) continue;
    let aiEdges=0,hpEdges=0,wallEdges=0,total=0;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy; total++;
      if(nx<0||ny<0||nx>=W||ny>=H){wallEdges++;continue;}
      const p=board[ny][nx]?.player;
      if(p===ap) aiEdges++; else if(p===hp) hpEdges++;
    }
    const sealRatio=(aiEdges+wallEdges)/Math.max(total,1);
    const infeasible=sz%5!==0;
    const parity=parityImbalance(reg)>0;
    if(sealRatio>=0.4&&hpEdges<=aiEdges*0.5){
      exposedPockets.push({cells:reg,sz,sealRatio,infeasible,parity,hpEdges,aiEdges});
    }
  }
  exposedPockets.sort((a,b)=>{
    const va=a.sealRatio*30+(a.infeasible?15:0)+(a.parity?10:0)-(a.sz*0.5);
    const vb=b.sealRatio*30+(b.infeasible?15:0)+(b.parity?10:0)-(b.sz*0.5);
    return vb-va;
  });

  const strandedCells=findStrandedOpponentCells(board,W,H,hp);
  let pivotZone=null;
  if(currentPlan){
    const currentSeal=getZoneSealProgress(currentPlan,board,W,H,ap);
    if(currentSeal.progress<0.4){
      const newPlan=findBestTerritoryZone(aiHand,board,W,H,ap,hp,allowFlip,PENTS,xformFn,100);
      if(newPlan&&newPlan.score>currentPlan.score*1.25){
        pivotZone=newPlan;
      }
    }
  } else {
    pivotZone=findBestTerritoryZone(aiHand,board,W,H,ap,hp,allowFlip,PENTS,xformFn,100);
  }

  const mistakePockets=[];
  for(const reg of regions){
    const sz=reg.length;
    if(sz<3||sz>15) continue;
    const infeasible=sz%5!==0, parity=parityImbalance(reg)>0;
    if(!infeasible&&!parity) continue;
    let hpAdj=false;
    for(const[x,y]of reg){
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(board[ny][nx]?.player===hp){hpAdj=true;break;}
      }
      if(hpAdj) break;
    }
    if(hpAdj) mistakePockets.push({cells:reg,sz,infeasible,parity});
  }
  return{exposedPockets,strandedCells,pivotZone,mistakePockets};
}

function opportunityBonus(abs,opp,board,simBoard,W,H,ap,hp,weightMult){
  if(!opp) return 0;
  weightMult=weightMult||1.0;
  let bonus=0;
  const simSet=new Set(abs.map(([x,y])=>y*W+x));

  for(const pkt of opp.exposedPockets.slice(0,4)){
    const pktSet=new Set(pkt.cells.map(([x,y])=>y*W+x));
    const pktBorder=new Set();
    for(const[x,y]of pkt.cells) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(!pktSet.has(ny*W+nx)) pktBorder.add(ny*W+nx);
    }
    let touched=0;
    for(const[x,y]of abs){
      if(pktBorder.has(y*W+x)) touched++;
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(pktBorder.has(ny*W+nx)){touched+=0.5;break;}
      }
    }
    if(touched>0){
      const val=(pkt.sealRatio*25+(pkt.infeasible?20:0)+(pkt.parity?15:0)+pkt.sz*0.8)*touched;
      bonus+=val*weightMult;
    }
    let hpCanReachAfter=false;
    for(const[x,y]of pkt.cells) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(simBoard[ny][nx]?.player===hp){hpCanReachAfter=true;break;}
      if(hpCanReachAfter) break;
    }
    const hpCouldReachBefore=pkt.hpEdges>0;
    if(hpCouldReachBefore&&!hpCanReachAfter){
      const sealVal=pkt.sz*(pkt.infeasible?55:35)+(pkt.parity?pkt.sz*20:0);
      bonus+=sealVal*weightMult;
    }
  }

  if(opp.strandedCells.length>0){
    const strandedSet=new Set(opp.strandedCells.map(([x,y])=>y*W+x));
    for(const[x,y]of abs) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(strandedSet.has(ny*W+nx)){
        bonus+=30*weightMult;
      }
    }
    for(const[sx,sy]of opp.strandedCells){
      let hasEmptyNeighbor=false;
      for(const[ox,oy]of DIRS){
        const nx=sx+ox,ny=sy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(simBoard[ny][nx]===null){hasEmptyNeighbor=true;break;}
      }
      if(!hasEmptyNeighbor) bonus+=50*weightMult;
    }
  }

  if(opp.pivotZone){
    const pz=opp.pivotZone;
    const pzBorder=new Set();
    for(const[x,y]of pz.cells) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(!pz.cellSet.has(ny*W+nx)) pzBorder.add(ny*W+nx);
    }
    for(const[x,y]of abs){
      if(pzBorder.has(y*W+x)) bonus+=40*weightMult;
      else if(pz.cellSet.has(y*W+x)) bonus+=12*weightMult;
    }
  }

  for(const mpkt of opp.mistakePockets){
    const mpktBorder=new Set();
    for(const[x,y]of mpkt.cells) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(!new Set(mpkt.cells.map(([cx,cy])=>cy*W+cx)).has(ny*W+nx)) mpktBorder.add(ny*W+nx);
    }
    for(const[x,y]of abs){
      if(mpktBorder.has(y*W+x)){
        const val=(mpkt.infeasible?18:0)+(mpkt.parity?12:0)+mpkt.sz*0.6;
        bonus+=val*weightMult;
      }
    }
  }

  return bonus;
}

// ─────────────────────────────────────────────────────────────────
//  ADVANCED STRATEGIC SYSTEMS
// ─────────────────────────────────────────────────────────────────

function findArticulationPoints(board,W,H){
  const idxMap=new Map(); const empty=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(board[y][x]===null){idxMap.set(y*W+x,empty.length);empty.push([x,y]);}
  const n=empty.length; if(!n) return new Set();
  const adj=Array.from({length:n},()=>[]);
  for(let i=0;i<n;i++){
    const[x,y]=empty[i];
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const k=ny*W+nx; if(idxMap.has(k)) adj[i].push(idxMap.get(k));
    }
  }
  const disc=new Array(n).fill(-1),low=new Array(n).fill(0),childCount=new Array(n).fill(0);
  const isAP=new Set(); let timer=0; const stack=[];
  for(let root=0;root<n;root++){
    if(disc[root]!==-1) continue;
    disc[root]=low[root]=timer++;
    stack.push({u:root,parent:-1,adjIdx:0});
    while(stack.length){
      const top=stack[stack.length-1]; const{u}=top; let pushed=false;
      while(top.adjIdx<adj[u].length){
        const v=adj[u][top.adjIdx++];
        if(v===top.parent) continue;
        if(disc[v]===-1){
          childCount[u]++;disc[v]=low[v]=timer++;
          stack.push({u:v,parent:u,adjIdx:0});pushed=true;break;
        } else low[u]=Math.min(low[u],disc[v]);
      }
      if(!pushed){
        stack.pop(); const p=top.parent;
        if(p===-1){if(childCount[u]>1) isAP.add(u);}
        else{low[p]=Math.min(low[p],low[u]);if(low[u]>=disc[p]) isAP.add(p);}
      }
    }
  }
  const result=new Set();
  for(const i of isAP) result.add(empty[i][1]*W+empty[i][0]);
  return result;
}

function articulationCutBonus(abs,preBoard,simBoard,W,H,ap,hp,preAPs,cachedSimRegions){
  const aps=preAPs||findArticulationPoints(preBoard,W,H);
  if(!aps.size) return 0;
  let regsCache=null,bonus=0;
  for(const[x,y]of abs){
    if(!aps.has(y*W+x)) continue;
    if(!regsCache) regsCache=cachedSimRegions||floodFillRegions(simBoard,W,H);
    if(regsCache.length>=2){
      const sizes=regsCache.map(r=>r.length).sort((a,b)=>a-b);
      bonus+=sizes[0]*5.5; if(sizes[0]%5!==0) bonus+=sizes[0]*4;
    } else bonus+=15;
  }
  return bonus;
}

function territorySealScore(simBoard,W,H,ap,hp,cachedRegions){
  const regions=cachedRegions||floodFillRegions(simBoard,W,H);
  let score=0;
  for(const reg of regions){
    let aiEdges=0,oppEdges=0,wallEdges=0;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H){wallEdges++;continue;}
      const p=simBoard[ny][nx]?.player;
      if(p===ap) aiEdges++; else if(p===hp) oppEdges++;
    }
    if(oppEdges===0&&(aiEdges+wallEdges)>0){
      const inf=reg.length%5!==0,pb=parityImbalance(reg)>0;
      score+=reg.length*10; if(inf) score+=reg.length*8; if(pb) score+=parityImbalance(reg)*12;
    }
    if(oppEdges>0&&aiEdges>oppEdges*2) score+=reg.length*2;
  }
  return score;
}

function boardSplitBonus(abs,preBoard,simBoard,W,H,ap,hp){
  const regsBefore=floodFillRegions(preBoard,W,H);
  const regsAfter=floodFillRegions(simBoard,W,H);
  if(regsAfter.length<=regsBefore.length) return 0;
  let bonus=0;
  for(const reg of regsAfter){
    if(reg.length<5) continue;
    let aiC=0,hpC=0;
    for(const[x,y]of reg){
      let aiN=0,hpN=0;
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const p=simBoard[ny][nx]?.player;
        if(p===ap) aiN++; else if(p===hp) hpN++;
      }
      if(aiN>hpN) aiC++; else if(hpN>aiN) hpC++;
    }
    if(aiC>hpC){bonus+=reg.length*4;if(reg.length%5===0) bonus+=reg.length*2;}
    else if(hpC>aiC){bonus-=reg.length*1.5;if(reg.length%5!==0) bonus+=reg.length*4;}
  }
  return bonus;
}

function opponentShapeReadScore(simBoard,W,H,hp,remHp,placedCount,allowFlip,PENTS,xformFn){
  const regions=floodFillRegions(simBoard,W,H);
  if(!regions.length||!remHp.length) return 0;
  let denialScore=0;
  const flipOpts=allowFlip?[false,true]:[false];
  for(const reg of regions){
    if(reg.length<5){
      let oppAdj=false;
      for(const[x,y]of reg){
        for(const[ox,oy]of DIRS){
          const nx=x+ox,ny=y+oy;
          if(nx<0||ny<0||nx>=W||ny>=H) continue;
          if(simBoard[ny][nx]?.player===hp){oppAdj=true;break;}
        }
        if(oppAdj) break;
      }
      if(oppAdj) denialScore+=(5-reg.length)*12;
      continue;
    }
    let blocked=0;
    for(const pk of remHp){
      let canFit=false;
      outer:for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=xformFn(PENTS[pk],rot,flip);
        for(const[bx,by]of reg) for(const[ax,ay]of shape){
          const ox=bx-ax,oy=by-ay; let valid=true;
          for(const[dx,dy]of shape){
            let inReg=false;
            for(const[rx,ry]of reg){if(rx===ox+dx&&ry===oy+dy){inReg=true;break;}}
            if(!inReg){valid=false;break;}
          }
          if(valid){canFit=true;break outer;}
        }
      }
      if(!canFit) blocked++;
    }
    const ratio=blocked/remHp.length;
    if(ratio>0.5) denialScore+=reg.length*ratio*8;
  }
  return denialScore;
}

function getPiecePlacements(pk,board,W,H,flipOpts,PENTS,xformFn){
  const placements=[];
  for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
    const shape=xformFn(PENTS[pk],rot,flip);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      let valid=true; const abs=[];
      for(const[dx,dy]of shape){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H||board[ny][nx]!==null){valid=false;break;}
        abs.push([nx,ny]);
      }
      if(valid) placements.push(abs);
    }
  }
  const seen=new Set();
  return placements.filter(abs=>{
    const key=abs.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    if(seen.has(key)) return false; seen.add(key); return true;
  });
}

function buildPieceCavityPlan(hand,board,W,H,ap,hp,allowFlip,PENTS,xformFn){
  if(!hand||hand.length<2) return null;
  const flipOpts=allowFlip?[false,true]:[false];
  const priority={X:10,W:9,F:8,U:7,V:6,Z:5,T:4,N:3,Y:3,P:2,L:1,I:0};
  const candidates=[...hand].sort((a,b)=>(priority[b]||0)-(priority[a]||0));
  for(const pk of candidates){
    const placements=getPiecePlacements(pk,board,W,H,flipOpts,PENTS,xformFn);
    if(!placements.length) continue;
    let bestSlot=null,bestScore=-Infinity;
    for(const abs of placements){
      let edgeBonus=0;
      for(const[x,y]of abs){
        if(x===0||x===W-1) edgeBonus+=2;
        if(y===0||y===H-1) edgeBonus+=2;
      }
      let oppFitCount=0;
      for(const opk of Object.keys(PENTS)){
        if(opk!==pk&&pieceCanFitInRegion(opk,abs,flipOpts,PENTS,xformFn)) oppFitCount++;
      }
      const exclusivity=11-Math.min(11,oppFitCount);
      const score=edgeBonus+exclusivity*3;
      if(score>bestScore){bestScore=score;bestSlot=abs;}
    }
    if(bestSlot){
      const cellSet=new Set(bestSlot.map(([x,y])=>y*W+x));
      return{piece:pk,cells:bestSlot,cellSet};
    }
  }
  return null;
}

function cavityFramingBonus(abs,cavityPlan,simBoard,W,H,ap){
  if(!cavityPlan) return 0;
  let bonus=0;
  for(const[x,y]of abs){
    if(cavityPlan.cellSet.has(y*W+x)){
      bonus-=80; 
    } else {
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(cavityPlan.cellSet.has(ny*W+nx)){bonus+=30;break;}
      }
    }
  }
  let intact=true;
  for(const[x,y]of cavityPlan.cells) if(simBoard[y][x]!==null){intact=false;break;}
  if(intact) bonus+=20;
  return bonus;
}

function detectOpponentCavity(board,W,H,hp,remHp,allowFlip,PENTS,xformFn){
  if(!remHp||!remHp.length) return null;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(board,W,H);
  let bestCavity=null,bestScore=-Infinity;
  for(const reg of regions){
    if(reg.length<5||reg.length>20) continue;
    let oppAdjCount=0;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(board[ny][nx]?.player===hp) oppAdjCount++;
    }
    for(const pk of remHp){
      for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=xformFn(PENTS[pk],rot,flip);
        for(const[bx,by]of reg) for(const[ax,ay]of shape){
          const ox=bx-ax,oy=by-ay; let valid=true; const abs=[];
          for(const[dx,dy]of shape){
            let inReg=false;
            for(const[rx,ry]of reg){if(rx===ox+dx&&ry===oy+dy){inReg=true;break;}}
            if(!inReg){valid=false;break;}
            abs.push([ox+dx,oy+dy]);
          }
          if(!valid) continue;
          const snugness = (abs.length / reg.length) * 20; 
          const sizeScore=20-reg.length;
          const adjBonus=Math.min(8,oppAdjCount*2);
          const score=snugness+sizeScore+adjBonus;
          if(score>bestScore){
            bestScore=score;
            bestCavity={piece:pk,cells:abs,cellSet:new Set(abs.map(([x,y])=>y*W+x))};
          }
        }
      }
    }
  }
  return bestCavity;
}

function opponentCavityIntrusionBonus(abs,oppCavity,W){
  if(!oppCavity) return 0;
  let bonus=0;
  const exactFit=oppCavity.cells&&oppCavity.cells.length===5;
  const baseHit=exactFit?200:130;  
  const baseAdj=exactFit?70:40;   
  for(const[x,y]of abs){
    if(oppCavity.cellSet.has(y*W+x)) bonus+=baseHit;
    else for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0) continue;
      if(oppCavity.cellSet.has(ny*W+nx)){bonus+=baseAdj;break;}
    }
  }
  return bonus;
}

function pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn){
  for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
    const shape=xformFn(PENTS[pk],rot,flip);
    for(const[bx,by]of reg) for(const[ax,ay]of shape){
      const ox=bx-ax,oy=by-ay; let valid=true;
      for(const[dx,dy]of shape){
        let inReg=false;
        for(const[rx,ry]of reg){if(rx===ox+dx&&ry===oy+dy){inReg=true;break;}}
        if(!inReg){valid=false;break;}
      }
      if(valid) return true;
    }
  }
  return false;
}

function selfShapeReadScore(simBoard,W,H,ap,hp,remAp,remHp,placedCount,allowFlip,PENTS,xformFn){
  const regions=floodFillRegions(simBoard,W,H);
  if(!regions.length||!remAp.length) return 0;
  let fitScore=0;
  const flipOpts=allowFlip?[false,true]:[false];

  for(const reg of regions){
    let adjToSelf=false;
    outer0:for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(simBoard[ny][nx]?.player===ap){adjToSelf=true;break outer0;}
    }
    if(!adjToSelf) continue;

    if(reg.length<5){fitScore-=(5-reg.length)*10;continue;}

    const aiFitting=[];   
    const oppFitting=[];  

    for(const pk of remAp){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)) aiFitting.push(pk);
    }
    for(const pk of (remHp||[])){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)) oppFitting.push(pk);
    }

    if(!aiFitting.length){
      fitScore-=reg.length*8;
      continue;
    }

    const aiRatio=aiFitting.length/remAp.length;
    const oppRatio=remHp?.length?oppFitting.length/remHp.length:0;

    fitScore+=reg.length*aiRatio*6;

    if(oppFitting.length===0 && aiFitting.length>0){
      fitScore+=reg.length*18;
      if(reg.length%5===0) fitScore+=reg.length*8;
    } else if(aiRatio>oppRatio+0.3){
      fitScore+=reg.length*(aiRatio-oppRatio)*10;
    }

    if(oppRatio>aiRatio) fitScore-=reg.length*(oppRatio-aiRatio)*8;
    if(reg.length%5!==0) fitScore-=(reg.length%5)*4;
  }
  return fitScore;
}

function pairExclusiveTerritoryScore(simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length<2) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(simBoard,W,H);
  let totalScore=0;

  for(let i=0;i<remAp.length;i++) for(let j=i+1;j<remAp.length;j++){
    const pkA=remAp[i], pkB=remAp[j];

    for(const reg of regions){
      if(reg.length<8||reg.length>14) continue;
      let adjToSelf=false;
      for(const[x,y]of reg) for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===ap){adjToSelf=true;break;}
      }
      if(!adjToSelf) continue;

      const placementsA=[];
      for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=xformFn(PENTS[pkA],rot,flip);
        for(const[bx,by]of reg) for(const[ax,ay]of shape){
          const ox=bx-ax,oy=by-ay; let valid=true; const abs=[];
          for(const[dx,dy]of shape){
            let inReg=false;
            for(const[rx,ry]of reg){if(rx===ox+dx&&ry===oy+dy){inReg=true;break;}}
            if(!inReg){valid=false;break;}
            abs.push([ox+dx,oy+dy]);
          }
          if(valid) placementsA.push(abs);
        }
      }
      if(!placementsA.length) continue;

      let pairCanTile=false;
      for(const absA of placementsA){
        const setA=new Set(absA.map(([x,y])=>y*W+x));
        const remainder=reg.filter(([x,y])=>!setA.has(y*W+x));
        if(remainder.length!==5) continue;
        if(pieceCanFitInRegion(pkB,remainder,flipOpts,PENTS,xformFn)){
          pairCanTile=true; break;
        }
      }
      if(!pairCanTile) continue;

      let oppCanContest=false;
      for(const pk of (remHp||[])){
        if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)){oppCanContest=true;break;}
      }

      const exclusivityBonus=oppCanContest?30:120;
      const puBonus=(pkA==='P'&&pkB==='U')||(pkA==='U'&&pkB==='P')?60:0;
      totalScore+=exclusivityBonus+puBonus;
    }
  }
  return Math.min(totalScore,300); 
}

function comboCavitySetupBonus(movAbs,pk,board,simBoard,W,H,ap,hp,remAp,remHp,placedCount,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length<3) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  const otherPieces=remAp.filter(p=>p!==pk);
  let bestBonus=0;

  for(const pkB of otherPieces){
    const placementsB=getPiecePlacements(pkB,simBoard,W,H,flipOpts,PENTS,xformFn);
    const sample=placementsB.slice(0,12);
    for(const absB of sample){
      const sim2=simBoard.map(r=>[...r]);
      for(const[x,y]of absB) sim2[y][x]={player:ap,pieceKey:pkB};

      const regions2=floodFillRegions(sim2,W,H);
      for(const reg of regions2){
        if(reg.length!==5) continue; 
        let adjToSelf=false;
        for(const[x,y]of reg) for(const[ox,oy]of DIRS){
          const nx=x+ox,ny=y+oy;
          if(nx>=0&&ny>=0&&nx<W&&ny<H&&sim2[ny][nx]?.player===ap){adjToSelf=true;break;}
        }
        if(!adjToSelf) continue;

        const thirdPieces=otherPieces.filter(p=>p!==pkB);
        let aiCanFill=false,oppCanFill=false;
        for(const pkC of thirdPieces){
          if(pieceCanFitInRegion(pkC,reg,flipOpts,PENTS,xformFn)){aiCanFill=true;break;}
        }
        for(const pkO of (remHp||[])){
          if(pieceCanFitInRegion(pkO,reg,flipOpts,PENTS,xformFn)){oppCanFill=true;break;}
        }

        if(aiCanFill&&!oppCanFill){
          bestBonus=Math.max(bestBonus,150);
        } else if(aiCanFill&&oppCanFill){
          bestBonus=Math.max(bestBonus,40);
        }
      }
    }
  }
  return bestBonus;
}

function iLaneFencingBonus(movAbs,pk,board,simBoard,W,H,aiHand,hpHand,allowFlip,PENTS,xformFn){
  if(!aiHand.includes('I')) return 0;
  if(pk==='I') return 0; 
  let bonus=0;

  const flipOpts=allowFlip?[false,true]:[false];

  // ── V6.0: True bisection analysis (replaces simple lane scan) ───
  const bisect = iBisectionAnalysis(board, W, H);
  let bestLane = null, bestLaneScore = -Infinity;

  if (bisect) {
    // Convert bisection data to the legacy lane format
    bestLane = bisect.type === 'row' ? { type: 'row', y: bisect.y } : { type: 'col', x: bisect.x };
    bestLaneScore = bisect.score;

    // Extra bonus if this bisection splits the board into two balanced halves
    // (true bisection creates two independent sub-games)
    const sl = buildSpreadLookup(W, H);
    const emptyBefore = boardToEmptyBig(board, W, H);
    const blobsBefore = bbBlobRegions(board, W, H, sl);
    const blobsAfter  = bbBlobRegions(simBoard, W, H, sl);

    // If placing this piece INCREASES the number of independent regions, it bisects the board
    if (blobsAfter.length > blobsBefore.length) {
      // Evaluate quality of the split: both halves should be divisible by 5
      const newBlobs = blobsAfter.filter(b => !blobsBefore.some(a => a.size === b.size));
      for (const blob of newBlobs) {
        if (blob.size % 5 === 0) {
          bonus += blob.size * 12; // clean bisection — excellent
        } else {
          bonus += blob.size * 4;  // rough bisection — still useful
        }
      }
      bonus += 200; // bisection accomplished bonus
    }
  } else {
    // Fallback: original lane scan
    for(let y=0;y<H;y++){
      let clearCount=0;
      for(let x=0;x<W-4;x++){
        let clear=true;
        for(let dx=0;dx<5;dx++) if(board[y][x+dx]!==null){clear=false;break;}
        if(clear) clearCount++;
      }
      if(clearCount>0){
        const edgeBonus=(y===0||y===H-1)?80:(y===1||y===H-2)?20:0;
        const score=clearCount*3+edgeBonus;
        if(score>bestLaneScore){bestLaneScore=score;bestLane={type:'row',y};}
      }
    }
    for(let x=0;x<W;x++){
      let clearCount=0;
      for(let y=0;y<H-4;y++){
        let clear=true;
        for(let dy=0;dy<5;dy++) if(board[y+dy][x]!==null){clear=false;break;}
        if(clear) clearCount++;
      }
      if(clearCount>0){
        const edgeBonus=(x===0||x===W-1)?80:(x===1||x===W-2)?20:0;
        const score=clearCount*3+edgeBonus;
        if(score>bestLaneScore){bestLaneScore=score;bestLane={type:'col',x};}
      }
    }
  }

  if(!bestLane) return 0;

  const laneSet=new Set();
  if(bestLane.type==='row'){
    for(let x=0;x<W;x++) laneSet.add(bestLane.y*W+x);
  } else {
    for(let y=0;y<H;y++) laneSet.add(y*W+bestLane.x);
  }

  let touchesLane=0, blocksLane=false;
  for(const[x,y]of movAbs){
    if(laneSet.has(y*W+x)){blocksLane=true;break;}
    for(const[ox,oy]of DIRS){
      if(laneSet.has((y+oy)*W+(x+ox))){touchesLane++;break;}
    }
  }

  if(blocksLane) return -200; 
  if(touchesLane>0) bonus+=touchesLane*35; // V6: boosted from 25 to 35

  const elongOpp=['L','Y','N','Z'].filter(p=>(hpHand||[]).includes(p));
  if(elongOpp.length>0){
    let laneOpenAfter=0;
    if(bestLane.type==='row'){
      for(let x=0;x<W-4;x++){
        let clear=true;
        for(let dx=0;dx<5;dx++) if(simBoard[bestLane.y][x+dx]!==null){clear=false;break;}
        if(clear) laneOpenAfter++;
      }
    } else {
      for(let y=0;y<H-4;y++){
        let clear=true;
        for(let dy=0;dy<5;dy++) if(simBoard[y+dy][bestLane.x]!==null){clear=false;break;}
        if(clear) laneOpenAfter++;
      }
    }
    const before=bestLaneScore/3;
    const reduction=before-laneOpenAfter;
    if(reduction>0&&touchesLane>0) bonus+=reduction*20; // V6: boosted from 15 to 20
  }

  return bonus;
}

function exclusivePieceCavityBonus(movAbs,pk,board,simBoard,W,H,ap,hp,remAp,remHp,placedCount,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length===0) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  let totalBonus=0;

  const regionsBefore=floodFillRegions(board,W,H);
  const regionsAfter=floodFillRegions(simBoard,W,H);

  const beforeSizes=new Map(regionsBefore.map(r=>{
    const key=r.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    return [key,r];
  }));

  for(const reg of regionsAfter){
    if(reg.length<5||reg.length>10) continue;
    const key=reg.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    if(beforeSizes.has(key)) continue; 

    let adjToSelf=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===ap){adjToSelf=true;break;}
    }
    if(!adjToSelf) continue;

    if(reg.length===10&&remAp.includes('P')&&remAp.includes('U')){
      const xs=reg.map(([x])=>x), ys=reg.map(([,y])=>y);
      const minX=Math.min(...xs),maxX=Math.max(...xs);
      const minY=Math.min(...ys),maxY=Math.max(...ys);
      const is3x2=(maxX-minX===2&&maxY-minY===1)||(maxX-minX===1&&maxY-minY===2);
      if(is3x2){
        const oppContest=(remHp||[]).some(opk=>pieceCanFitInRegion(opk,reg,flipOpts,PENTS,xformFn));
        totalBonus+=oppContest?60:180; 
        continue;
      }
    }

    if(reg.length===5){
      const aiFitting=remAp.filter(apk=>pieceCanFitInRegion(apk,reg,flipOpts,PENTS,xformFn));
      const oppFitting=(remHp||[]).filter(opk=>pieceCanFitInRegion(opk,reg,flipOpts,PENTS,xformFn));

      if(aiFitting.length===0) continue; 

      if(oppFitting.length===0){
        const puBonus=(aiFitting.includes('P')||aiFitting.includes('U'))?50:0;
        totalBonus+=200+puBonus;
      } else if(aiFitting.length>0&&oppFitting.length<aiFitting.length){
        totalBonus+=60;
      }
    }
  }

  for(const reg of regionsBefore){
    if(reg.length<5||reg.length>10) continue;
    const regSet=new Set(reg.map(([x,y])=>y*W+x));

    const aiFit=remAp.filter(apk=>pieceCanFitInRegion(apk,reg,flipOpts,PENTS,xformFn));
    const oppFit=(remHp||[]).filter(opk=>pieceCanFitInRegion(opk,reg,flipOpts,PENTS,xformFn));
    if(aiFit.length===0||oppFit.length>0) continue; 

    const fillsIt=movAbs.some(([x,y])=>regSet.has(y*W+x));
    if(fillsIt){totalBonus-=150;continue;}

    let frames=0;
    for(const[mx,my]of movAbs) for(const[ox,oy]of DIRS){
      if(regSet.has((my+oy)*W+(mx+ox))){frames++;break;}
    }
    if(frames>0) totalBonus+=frames*35;
  }

  return totalBonus;
}

function antiExclusiveTerritoryBonus(movAbs, board, simBoard, W, H, ap, hp, remAp, remHp, allowFlip, PENTS, xformFn) {
  if (!remAp || !remAp.length) return 0;
  const flipOpts = allowFlip ? [false, true] : [false];
  let totalBonus = 0;

  const regionsBefore = floodFillRegions(board, W, H);
  const regionsAfter  = floodFillRegions(simBoard, W, H);

  const beforeKeys = new Set(regionsBefore.map(r =>
    r.map(([x,y]) => y * W + x).sort((a,b) => a-b).join(',')
  ));

  for (const reg of regionsAfter) {
    if (reg.length < 5 || reg.length > 30) continue;

    let adjToSelf = false, adjToOpp = false;
    for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const p = simBoard[ny][nx]?.player;
        if (p === ap) adjToSelf = true;
        if (p === hp)  adjToOpp  = true;
      }
    }

    const aiFitting  = remAp.filter(pk => pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn));
    const oppFitting = (remHp || []).filter(pk => pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn));

    const regKey = reg.map(([x,y]) => y * W + x).sort((a,b) => a-b).join(',');
    const isNew  = !beforeKeys.has(regKey); 

    if (adjToSelf && aiFitting.length > 0 && oppFitting.length === 0) {
      const divisible = reg.length % 5 === 0;
      const base = reg.length * (divisible ? 40 : 22);
      totalBonus += isNew ? base * 1.6 : base * 0.8; 
    } else if (adjToSelf && aiFitting.length > 0 &&
               aiFitting.length > oppFitting.length * 1.5) {
      totalBonus += reg.length * (aiFitting.length - oppFitting.length) * 6;
    }

    if (isNew && adjToSelf && aiFitting.length === 0 && oppFitting.length > 0) {
      totalBonus -= reg.length * 50;
    } else if (isNew && adjToSelf && oppFitting.length > aiFitting.length * 1.5 && oppFitting.length > 0) {
      totalBonus -= reg.length * (oppFitting.length - aiFitting.length) * 14;
    }
  }

  return totalBonus;
}

function detectForkThreat(board,W,H,hp,remHp,allowFlip,PENTS,xformFn){
  const regions=floodFillRegions(board,W,H);
  const threatenedRegions=[];
  for(const reg of regions){
    if(reg.length<5) continue;
    let oppBorders=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&board[ny][nx]?.player===hp){oppBorders=true;break;}
    }
    if(oppBorders) threatenedRegions.push(reg);
  }

  if(threatenedRegions.length<2) return {active:false,zones:[],pivotCells:new Set(),severity:0};

  const sortedBySize=[...threatenedRegions].sort((a,b)=>a.length-b.length);
  const severity=sortedBySize[0].length; 

  const pivotCells=new Set();
  const regionIndex=new Map(); 
  threatenedRegions.forEach((reg,i)=>reg.forEach(([x,y])=>regionIndex.set(y*W+x,i)));

  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(board[y][x]!==null) continue;
    const touchedRegions=new Set();
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&board[ny][nx]===null){
        const k=ny*W+nx;
        if(regionIndex.has(k)) touchedRegions.add(regionIndex.get(k));
      }
    }
    const selfKey=y*W+x;
    if(regionIndex.has(selfKey)) touchedRegions.add(regionIndex.get(selfKey));
    if(touchedRegions.size>=2) pivotCells.add(y*W+x);
  }

  return {
    active:true,
    zones:threatenedRegions,
    pivotCells,
    severity
  };
}

function forkCounterBonus(movAbs,board,simBoard,W,H,ap,hp,forkThreat){
  if(!forkThreat||!forkThreat.active) return 0;
  const {pivotCells,zones,severity}=forkThreat;
  let bonus=0;

  let hitsPivot=false;
  for(const[x,y]of movAbs){
    if(pivotCells.has(y*W+x)){hitsPivot=true; bonus+=120; break;}
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&pivotCells.has(ny*W+nx)){bonus+=45; break;}
    }
  }

  const smallestZone=zones.reduce((a,b)=>a.length<b.length?a:b);
  const smallZoneSet=new Set(smallestZone.map(([x,y])=>y*W+x));

  let cellsInSmallZone=0;
  for(const[x,y]of movAbs) if(smallZoneSet.has(y*W+x)) cellsInSmallZone++;

  let aiZonePressure=0;
  for(const[x,y]of smallestZone) for(const[ox,oy]of DIRS){
    const nx=x+ox,ny=y+oy;
    if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===ap) aiZonePressure++;
  }

  if(cellsInSmallZone>0) bonus+=cellsInSmallZone*30; 
  if(aiZonePressure>0) bonus+=aiZonePressure*8; 

  const urgency=Math.min(1.5,20/Math.max(5,severity));
  bonus*=urgency;

  return bonus;
}

function cooperativeCavityPenalty(movAbs,board,simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remHp||remHp.length===0) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  let totalPenalty=0;

  const regionsBefore=floodFillRegions(board,W,H);
  const regionsAfter=floodFillRegions(simBoard,W,H);

  const beforeKeys=new Set(regionsBefore.map(r=>r.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',')));

  for(const reg of regionsAfter){
    if(reg.length<5||reg.length>15) continue;
    const key=reg.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    if(beforeKeys.has(key)) continue; 

    let adjToOpp=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===hp){adjToOpp=true;break;}
    }
    if(!adjToOpp) continue;

    const oppFitting=remHp.filter(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));
    const aiFitting=(remAp||[]).filter(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));

    if(oppFitting.length===0) continue; 

    let aiFramed=false;
    const regSet=new Set(reg.map(([x,y])=>y*W+x));
    for(const[mx,my]of movAbs) for(const[ox,oy]of DIRS){
      if(regSet.has((my+oy)*W+(mx+ox))){aiFramed=true;break;}
    }
    if(!aiFramed) continue; 

    if(aiFitting.length===0){
      totalPenalty+=reg.length*28; 
    } else if(oppFitting.length>aiFitting.length){
      const ratio=(oppFitting.length-aiFitting.length)/Math.max(1,remHp.length);
      totalPenalty+=reg.length*ratio*14;
    }
  }

  return -totalPenalty; 
}

function abandonedZonePenalty(movAbs,simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remHp||remHp.length===0) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(simBoard,W,H);
  let penalty=0;

  for(const reg of regions){
    if(reg.length<8) continue; 

    let oppBorders=false, aiBorders=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const p=simBoard[ny][nx]?.player;
      if(p===hp) oppBorders=true;
      if(p===ap) aiBorders=true;
    }

    if(!oppBorders||aiBorders) continue; 

    const aiFit=(remAp||[]).some(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));
    const oppFit=remHp.some(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));

    if(!oppFit) continue; 
    if(!aiFit){
      penalty+=reg.length*5;
      continue;
    }

    const oppFitCount=remHp.filter(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)).length;
    penalty+=reg.length*oppFitCount*4;
  }

  return -penalty; 
}

function sealingFinisherBonus(abs,preBoard,simBoard,W,H,ap,hp){
  const regsAfter=floodFillRegions(simBoard,W,H);
  let bonus=0;
  for(const regAfter of regsAfter){
    if(regAfter.length<5) continue;
    let oppBefore=false;
    for(const[x,y]of regAfter){
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(preBoard[ny][nx]?.player===hp){oppBefore=true;break;}
      }
      if(oppBefore) break;
    }
    if(!oppBefore) continue;
    let oppAfter=false,aiAfter=0;
    for(const[x,y]of regAfter){
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H){aiAfter++;continue;}
        const p=simBoard[ny][nx]?.player;
        if(p===ap) aiAfter++; else if(p===hp){oppAfter=true;break;}
      }
      if(oppAfter) break;
    }
    if(!oppAfter&&aiAfter>0){
      const inf=regAfter.length%5!==0,pt=parityImbalance(regAfter)>0;
      bonus+=regAfter.length*20;
      if(inf) bonus+=regAfter.length*16;
      if(pt)  bonus+=parityImbalance(regAfter)*22;
    }
  }
  return bonus;
}

function endgameParityScore(simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length>6) return 0;
  const weightMul = remAp.length > 4 ? 0.45 : 1.0;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(simBoard,W,H);
  let score=0;
  for(const reg of regions){
    if(reg.length<5) continue; 
    const size=reg.length;
    let aiFits=0;
    for(const pk of remAp){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)){aiFits++;break;}
    }
    let oppFits=0;
    for(const pk of remHp){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)){oppFits++;break;}
    }

    if(aiFits===0 && size%5===0){
      score-=size*(size<=5?60:size<=10?40:20)*weightMul;
    } else if(aiFits===0 && size%5!==0){
      score-=size*15*weightMul;
    } else if(oppFits>0 && aiFits===0){
      score-=size*50*weightMul;
    } else if(oppFits===0 && aiFits>0 && size===5){
      score+=size*30*weightMul;
    }
  }
  return score;
}

function computePiecePlacementCounts(hand, board, W, H, placed, allowFlip, PENTS, xformFn) {
  const counts = new Map();
  const flipOpts = allowFlip ? [false, true] : [false];
  for (const pk of hand) {
    let count = 0;
    const base = PENTS[pk];
    const seen = new Set();
    for (const flip of flipOpts) for (let rot = 0; rot < 4; rot++) {
      const shape = xformFn(base, rot, flip);
      const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
      if (seen.has(oKey)) continue; seen.add(oKey);
      for (let ay = 0; ay < H; ay++) for (let ax = 0; ax < W; ax++) {
        let valid = true; const abs = [];
        for (const [dx,dy] of shape) {
          const x=ax+dx, y=ay+dy;
          if (x<0||y<0||x>=W||y>=H||board[y][x]!==null) { valid=false; break; }
          abs.push([x,y]);
        }
        if (!valid) continue;
        if (placed > 0) {
          let touches = false;
          tO: for (const [x,y] of abs) for (const [ox,oy] of DIRS) {
            const nx=x+ox, ny=y+oy;
            if (nx>=0&&ny>=0&&nx<W&&ny<H&&board[ny][nx]!==null) { touches=true; break tO; }
          }
          if (!touches) continue;
        }
        count++;
      }
    }
    counts.set(pk, count);
  }
  return counts;
}

function placementCountGradientPenalty(hand, placementCounts) {
  if (!hand || !hand.length || !placementCounts || !placementCounts.size) return 0;
  let minCount = Infinity;
  for (const pk of hand) {
    const count = placementCounts.get(pk) ?? 999;
    if (count < minCount) minCount = count;
  }
  if (minCount === 0) return -5000;
  if (minCount === 1) return -2000;
  if (minCount <= 3) return -800;
  if (minCount <= 5) return -400;
  if (minCount <= 8) return -100;
  if (minCount <= 12) return -30;
  return 0;
}

function allPiecesViabilityScore(sim, W, H, remAp, placed, allowFlip, PENTS, xformFn) {
  if (!remAp || !remAp.length) return 0;
  const flipOpts = allowFlip ? [false, true] : [false];
  let penalty = 0;
  for (const pk of remAp) {
    let hasPlacement = false;
    const base = PENTS[pk];
    const seen = new Set();
    outer: for (const flip of flipOpts) for (let rot = 0; rot < 4; rot++) {
      const shape = xformFn(base, rot, flip);
      const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
      if (seen.has(oKey)) continue; seen.add(oKey);
      for (let ay = 0; ay < H; ay++) for (let ax = 0; ax < W; ax++) {
        let valid = true; const abs = [];
        for (const [dx,dy] of shape) {
          const x=ax+dx, y=ay+dy;
          if (x<0||y<0||x>=W||y>=H||sim[y][x]!==null) { valid=false; break; }
          abs.push([x,y]);
        }
        if (!valid) continue;
        if (placed > 0) {
          let touches = false;
          tO: for (const [x,y] of abs) for (const [ox,oy] of DIRS) {
            const nx=x+ox, ny=y+oy;
            if (nx>=0&&ny>=0&&nx<W&&ny<H&&sim[ny][nx]!==null) { touches=true; break tO; }
          }
          if (!touches) continue;
        }
        hasPlacement = true; break outer;
      }
    }
    if (!hasPlacement) {
      penalty -= (pk === 'X' ? 1000 : pk === 'I' ? 800 : 500);
    }
  }

  // --- NEW (v4.2): Bounding Box Trap Detection ---
  const aiHasCompact = remAp.includes('P') || remAp.includes('U');
  const aiHasBulky = remAp.some(p => ['I','L','N','Y','T','Z'].includes(p));
  
  if (aiHasBulky && !aiHasCompact) {
    // If the AI only has bulky pieces, penalize heavily if regions are too small
    const regions = floodFillRegions(sim, W, H);
    for (const reg of regions) {
      // If a region is exactly 5 to 7 cells, check if it's a tight 3x2 or 2x3 trap
      if (reg.length >= 5 && reg.length <= 7) {
         let minX=W, maxX=-1, minY=H, maxY=-1;
         for (const [x,y] of reg) {
             if(x<minX) minX=x; if(x>maxX) maxX=x;
             if(y<minY) minY=y; if(y>maxY) maxY=y;
         }
         let width = maxX - minX + 1;
         let height = maxY - minY + 1;
         
         // A 3x2 or 2x3 box physically cannot fit L, I, N, T, Y, or Z
         if ((width <= 3 && height <= 2) || (width <= 2 && height <= 3)) {
             penalty -= 600; // Panic: We are creating a cavity we cannot use!
         }
      }
    }
  }

  return penalty;
}

const CONSTRAINED_URGENT_SET = ['X','W','U','F','I','L','N','Y','Z'];

function constrainedPieceSurvivalPenalty(simBoard, W, H, remAp, allowFlip, PENTS, xformFn) {
  const hardPieces = remAp.filter(p => CONSTRAINED_URGENT_SET.includes(p));
  if (!hardPieces.length) return 0;
  
  const flipOpts = allowFlip ? [false, true] : [false];
  const penalties = { X: 800, W: 600, U: 500, F: 400, I: 500, L: 250, N: 250, Y: 250, Z: 200 };
  let totalPenalty = 0;

  for (const pk of hardPieces) {
    // ── V5.1 FIX: Count placements (capped at 4) instead of just binary existence ──
    // This enables exponential scaling: 0 spots = full penalty, 1 = 60%, 2 = 30%, 3 = 10%
    let placementCount = 0;
    const COUNT_CAP = 4; // stop after 4 — we only need to know "0 / 1 / 2 / 3 / safe"
    outer: for (const flip of flipOpts) {
      for (let rot = 0; rot < 4; rot++) {
        const shape = xformFn(PENTS[pk], rot, flip);
        for (let ay = 0; ay < H; ay++) {
          for (let ax = 0; ax < W; ax++) {
            let valid = true;
            for (const [dx, dy] of shape) {
              const x = ax + dx, y = ay + dy;
              if (x < 0 || y < 0 || x >= W || y >= H || simBoard[y][x] !== null) { 
                valid = false; break; 
              }
            }
            if (valid) {
              placementCount++;
              if (placementCount >= COUNT_CAP) break outer;
            }
          }
        }
      }
    }

    const basePenalty = penalties[pk] || 200;
    if      (placementCount === 0) totalPenalty -= basePenalty;           // fully stranded — full penalty
    else if (placementCount === 1) totalPenalty -= basePenalty * 0.60;   // 1 spot — very dangerous
    else if (placementCount === 2) totalPenalty -= basePenalty * 0.30;   // 2 spots — at risk
    else if (placementCount === 3) totalPenalty -= basePenalty * 0.10;   // 3 spots — mild pressure
    // 4+ placements: no penalty — piece is safe
  }
  return totalPenalty;
}

function iPieceUrgencyBonus(pk,placedCount,boardW,boardH){
  if(pk!=='I') return 0;
  const fillRatio=(placedCount*5)/(boardW*boardH);
  if(fillRatio<0.15) return 0;
  return fillRatio*90;
}

function iEdgePlacementBonus(pk,movAbs,W,H){
  if(pk!=='I') return 0;
  if(!movAbs||movAbs.length!==5) return 0;
  const xs=movAbs.map(([x])=>x);
  const ys=movAbs.map(([,y])=>y);
  const isHorizontal=new Set(ys).size===1;
  const isVertical=new Set(xs).size===1;
  if(!isHorizontal&&!isVertical) return 0;
  if(isHorizontal){
    const row=ys[0];
    if(row===0||row===H-1) return 180;  
    if(row===1||row===H-2) return 60;   
    return -220;                         
  }
  const col=xs[0];
  if(col===0||col===W-1) return 180;   
  if(col===1||col===W-2) return 60;    
  return -220;                          
}

function iLaneClosingBonus(abs,board,simBoard,W,H){
  const lanes=[];
  for(let y=0;y<H;y++){
    let run=0,start=0;
    for(let x=0;x<=W;x++){
      if(x<W&&board[y][x]===null){if(!run) start=x; run++;}
      else{if(run>=5) for(let i=start;i<start+run;i++) lanes.push(y*W+i); run=0;}
    }
  }
  for(let x=0;x<W;x++){
    let run=0,start=0;
    for(let y=0;y<=H;y++){
      if(y<H&&board[y][x]===null){if(!run) start=y; run++;}
      else{if(run>=5) for(let j=start;j<start+run;j++) lanes.push(j*W+x); run=0;}
    }
  }
  if(!lanes.length) return 0;
  const laneSet=new Set(lanes);
  let bonus=0;
  for(const[x,y]of abs){
    if(laneSet.has(y*W+x)) bonus+=28; 
  }
  let lanesBefore=0,lanesAfter=0;
  for(let y=0;y<H;y++){
    let run=0;
    for(let x=0;x<=W;x++){
      if(x<W&&board[y][x]===null) run++;
      else{if(run>=5) lanesBefore++; run=0;}
    }
    run=0;
    for(let x=0;x<=W;x++){
      if(x<W&&simBoard[y][x]===null) run++;
      else{if(run>=5) lanesAfter++; run=0;}
    }
  }
  for(let x=0;x<W;x++){
    let run=0;
    for(let y=0;y<=H;y++){
      if(y<H&&board[y][x]===null) run++;
      else{if(run>=5) lanesBefore++; run=0;}
    }
    run=0;
    for(let y=0;y<=H;y++){
      if(y<H&&simBoard[y][x]===null) run++;
      else{if(run>=5) lanesAfter++; run=0;}
    }
  }
  const laneReduction=lanesBefore-lanesAfter;
  if(laneReduction>0) bonus+=laneReduction*18;
  return bonus;
}

function countReachableILanes(board,W,H){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  let count=0;
  for(let y=0;y<H;y++){
    for(let x=0;x<=W-5;x++){
      let allEmpty=true;
      for(let i=0;i<5;i++) if(board[y][x+i]!==null){allEmpty=false;break;}
      if(!allEmpty) continue;
      let touches=false;
      outer:for(let i=0;i<5;i++) for(const[ox,oy]of dirs){
        const nx=x+i+ox,ny=y+oy;
        if(nx>=0&&ny>=0&&nx<W&&ny<H&&board[ny][nx]!==null){touches=true;break outer;}
      }
      if(touches) count++;
    }
  }
  for(let x=0;x<W;x++){
    for(let y=0;y<=H-5;y++){
      let allEmpty=true;
      for(let i=0;i<5;i++) if(board[y+i][x]!==null){allEmpty=false;break;}
      if(!allEmpty) continue;
      let touches=false;
      outer:for(let i=0;i<5;i++) for(const[ox,oy]of dirs){
        const nx=x+ox,ny=y+i+oy;
        if(nx>=0&&ny>=0&&nx<W&&ny<H&&board[ny][nx]!==null){touches=true;break outer;}
      }
      if(touches) count++;
    }
  }
  return count;
}

function pieceHasAnyPlacement(board,pk,W,H,placed,allowFlip,PENTS,xformFn){
  const base=PENTS[pk];
  const flipOpts=allowFlip?[false,true]:[false];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const seen=new Set();
  for(const f of flipOpts) for(let r=0;r<4;r++){
    const shape=xformFn(base,r,f);
    const oKey=shape.map(([x,y])=>`${x},${y}`).join('|');
    if(seen.has(oKey)) continue; seen.add(oKey);
    for(let ay=0;ay<H;ay++) for(let ax=0;ax<W;ax++){
      let valid=true; const abs=[];
      for(const[dx,dy]of shape){
        const x=ax+dx,y=ay+dy;
        if(x<0||y<0||x>=W||y>=H||board[y][x]!==null){valid=false;break;}
        abs.push([x,y]);
      }
      if(!valid) continue;
      if(placed>0){
        let touches=false;
        tO:for(const[x,y]of abs) for(const[ox,oy]of dirs){
          const nx=x+ox,ny=y+oy;
          if(nx>=0&&ny>=0&&nx<W&&ny<H&&board[ny][nx]!==null){touches=true;break tO;}
        }
        if(!touches) continue;
      }
      return true;
    }
  }
  return false;
}

function xSpacePreservationBonus(movAbs, board, simBoard, W, H, remAp, allowFlip, PENTS, xformFn) {
  if (!remAp.includes('X')) return 0;

  const countPlacements = (b) => {
    let count = 0;
    const shape = xformFn(PENTS['X'], 0, false);
    for (let ay = 0; ay < H; ay++) {
      for (let ax = 0; ax < W; ax++) {
        let valid = true;
        for (const [dx, dy] of shape) {
          const x = ax + dx, y = ay + dy;
          if (x < 0 || y < 0 || x >= W || y >= H || b[y][x] !== null) { valid = false; break; }
        }
        if (valid) count++;
      }
    }
    return count;
  };

  const before = countPlacements(board);
  const after = countPlacements(simBoard);
  const reduction = before - after;
  
  return reduction > 0 ? -(reduction * 40) : 0;
}

// ══════════════════════════════════════════════════════════════════════════
//  MCTS (MONTE CARLO TREE SEARCH) HELPERS
// ══════════════════════════════════════════════════════════════════════════

let _godShapes=null;
function getGodShapes(PENTS,xformFn){
  if(_godShapes) return _godShapes;
  _godShapes={};
  for(const[pk,base] of Object.entries(PENTS)){
    const seen=new Set();const shapes=[];
    for(const flip of[false,true]) for(let r=0;r<4;r++){
      const shape=xformFn(base,r,flip);
      const key=shape.map(([x,y])=>`${x},${y}`).join('|');
      if(!seen.has(key)){seen.add(key);shapes.push(shape);}
    }
    _godShapes[pk]=shapes;
  }
  return _godShapes;
}

function _rolloutPlacementCount(pk,b,W,H,pc,godShapes){
  const shapes=godShapes[pk]; let count=0;
  for(const shape of shapes){
    for(let ay=0;ay<H;ay++) for(let ax=0;ax<W;ax++){
      let valid=true; const abs=[];
      for(const[dx,dy]of shape){
        const x=ax+dx,y=ay+dy;
        if(x<0||y<0||x>=W||y>=H||b[y][x]!==null){valid=false;break;}
        abs.push([x,y]);
      }
      if(!valid) continue;
      if(pc>0){
        let touches=false;
        tO:for(const[x,y]of abs) for(const[ox,oy]of DIRS){
          const nx=x+ox,ny=y+oy;
          if(nx>=0&&ny>=0&&nx<W&&ny<H&&b[ny][nx]!==null){touches=true;break tO;}
        }
        if(!touches) continue;
      }
      count++;
    }
  }
  return count;
}

function _rolloutGetPlacements(pk,b,W,H,pc,godShapes){
  const shapes=godShapes[pk]; const placements=[];
  for(const shape of shapes){
    for(let ay=0;ay<H;ay++) for(let ax=0;ax<W;ax++){
      let valid=true; const abs=[];
      for(const[dx,dy]of shape){
        const x=ax+dx,y=ay+dy;
        if(x<0||y<0||x>=W||y>=H||b[y][x]!==null){valid=false;break;}
        abs.push([x,y]);
      }
      if(!valid) continue;
      if(pc>0){
        let touches=false;
        tO:for(const[x,y]of abs) for(const[ox,oy]of DIRS){
          const nx=x+ox,ny=y+oy;
          if(nx>=0&&ny>=0&&nx<W&&ny<H&&b[ny][nx]!==null){touches=true;break tO;}
        }
        if(!touches) continue;
      }
      placements.push(abs);
    }
  }
  return placements;
}

function fastRolloutGame(board, W, H, ap, hp, nextTurn, remaining, placed, godShapes) {
  const b = board.map(r => [...r]);
  const rem = { [ap]: [...(remaining[ap] || [])], [hp]: [...(remaining[hp] || [])] };
  let curr = nextTurn, pc = placed;
  
  for (let turn = 0; turn < 20; turn++) {
    const hand = rem[curr];
    if (!hand.length) return curr === ap ? hp : ap;

    const counted = hand.map(pk => ({ pk, cnt: _rolloutPlacementCount(pk, b, W, H, pc, godShapes) }));
    counted.sort((a, b) => a.cnt - b.cnt);

    let done = false;
    for (const { pk, cnt } of counted) {
      if (done) break;
      if (cnt === 0) return curr === ap ? hp : ap; // Immediate loss if stranded

      const placements = _rolloutGetPlacements(pk, b, W, H, pc, godShapes);
      if (!placements.length) continue;

      let bestAbs = placements[0];
      let bestScore = -Infinity;
      
      for (const abs of placements) {
        let score = 0;
        for (const [x, y] of abs) {
          for (const [ox, oy] of DIRS) {
            const nx = x + ox, ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
              score += 1; 
            } else if (b[ny][nx]?.player === curr) {
              score += 3; 
            } else if (b[ny][nx] === null) {
              score -= 1; 
            }
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestAbs = abs;
        }
      }

      for (const [x, y] of bestAbs) b[y][x] = { player: curr, pieceKey: pk };
      rem[curr] = rem[curr].filter(p => p !== pk);
      pc++; 
      done = true;
    }
    if (!done) return curr === ap ? hp : ap;
    curr = curr === ap ? hp : ap;
  }
  return ap;
}

function fastMCTS(m,board,W,H,ap,hp,remaining,placed,godShapes,numRollouts){
  const simBoard=board.map(r=>[...r]);
  for(const[x,y]of m.abs) simBoard[y][x]={player:ap,pieceKey:m.pk};
  const simRem={[ap]:(remaining[ap]||[]).filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
  const nextTurn=hp; 
  let wins=0;
  for(let i=0;i<numRollouts;i++){
    if(fastRolloutGame(simBoard,W,H,ap,hp,nextTurn,simRem,placed+1,godShapes)===ap) wins++;
  }
  return wins/numRollouts;
}

function getDynamicWeights(board,W,H,ap,hp,placedCount,totalPieces){
  const t=voronoiTerritory(board,W,H,ap,hp);
  const lead=t.ap-t.hp;
  const progress=Math.min(1,placedCount/Math.max(totalPieces*2,1));
  const bs=Math.max(1,(W*H)/60);
  let aggression;
  if(lead>8*bs)       aggression=0.60;
  else if(lead>4*bs)  aggression=0.82;
  else if(lead<-8*bs) aggression=1.65;
  else if(lead<-4*bs) aggression=1.35;
  else                aggression=1.0;
  const earlyBoost=progress<0.3?1.5:1.0;
  const lateBoost=progress>0.6?1.6:1.0;
  return{aggression,lead,progress,earlyBoost,lateBoost};
}

function identifyKeyPieces(hand,board,W,H,ap,allowFlip,PENTS,xformFn){
  const scores=new Map(); for(const pk of hand) scores.set(pk,0);
  if(hand.length<=3) return scores;
  const regions=floodFillRegions(board,W,H);
  const flipOpts=allowFlip?[false,true]:[false];
  for(const reg of regions){
    if(reg.length<5||reg.length>25) continue;
    let aiAdj=false;
    for(const[x,y]of reg){
      for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(board[ny][nx]?.player===ap){aiAdj=true;break;}
      }
      if(aiAdj) break;
    }
    if(!aiAdj) continue;
    const fitting=[];
    for(const pk of hand){
      let canFit=false;
      outer:for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=xformFn(PENTS[pk],rot,flip);
        for(const[bx,by]of reg) for(const[ax,ay]of shape){
          const ox=bx-ax,oy=by-ay; let valid=true;
          for(const[dx,dy]of shape){
            let inReg=false;
            for(const[rx,ry]of reg){if(rx===ox+dx&&ry===oy+dy){inReg=true;break;}}
            if(!inReg){valid=false;break;}
          }
          if(valid){canFit=true;break outer;}
        }
      }
      if(canFit) fitting.push(pk);
    }
    if(!fitting.length) continue;
    const infB=reg.length%5!==0?1.8:1.0;
    const zv=reg.length*infB;
    if(fitting.length===1)      fitting.forEach(pk=>scores.set(pk,scores.get(pk)+zv*7));
    else if(fitting.length===2) fitting.forEach(pk=>scores.set(pk,scores.get(pk)+zv*3));
    else if(fitting.length<=4)  fitting.forEach(pk=>scores.set(pk,scores.get(pk)+zv*1.2));
  }
  const iv={I:22,P:20,L:18,Y:17,N:15,V:16,T:13,Z:11,W:9,F:7,U:7,X:5};
  for(const pk of hand) scores.set(pk,scores.get(pk)+(iv[pk]||5));
  return scores;
}

function pieceReservationPenalty(pk,hand,keyScores,piecesPlaced,totalHandSize){
  if(hand.length<=3) return 0;
  const myScore=keyScores.get(pk)||0; if(myScore<13) return 0;
  const expendable=hand.filter(k=>k!==pk&&(keyScores.get(k)||0)<myScore*0.55);
  if(!expendable.length) return 0;
  const progress=Math.min(1,piecesPlaced/Math.max(totalHandSize*2,1));
  const ef=Math.max(0,1-progress*1.6);
  return ef<=0?0:-(myScore*ef*4.5);
}

function isMirrorWar(W,H){return W===15&&H===8;}

function detectDualAnchorThreat(board,W,H,hp){
  const quadrants=[
    {cx:0,    cy:0,    dx:1, dy:1}, 
    {cx:W-1,  cy:0,    dx:-1,dy:1},  
    {cx:0,    cy:H-1,  dx:1, dy:-1}, 
    {cx:W-1,  cy:H-1,  dx:-1,dy:-1}, 
  ];
  const anchoredQuads=[];
  for(const q of quadrants){
    let anchored=false;
    for(let dy=0;dy<Math.ceil(H/2)&&!anchored;dy++){
      for(let dx=0;dx<Math.ceil(W/2)&&!anchored;dx++){
        const nx=q.cx+dx*q.dx, ny=q.cy+dy*q.dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(board[ny][nx]?.player===hp) anchored=true;
      }
    }
    if(anchored) anchoredQuads.push(q);
  }
  if(anchoredQuads.length<2) return null;
  const cx=Math.floor(W/2), cy=Math.floor(H/2);
  return{anchoredCount:anchoredQuads.length,center:[cx,cy]};
}

function dualAnchorCounterBonus(movAbs,board,W,H,ap,hp){
  const threat=detectDualAnchorThreat(board,W,H,hp);
  if(!threat) return 0;
  const[cx,cy]=threat.center;
  let bonus=0;
  for(const[x,y]of movAbs){
    const dist=Math.abs(x-cx)+Math.abs(y-cy);
    if(dist<=4) bonus+=(5-dist)*14;
    let closestAnchoredDist=Infinity;
    const corners=[[0,0],[W-1,0],[0,H-1],[W-1,H-1]];
    for(const[qx,qy]of corners){
      let hasOpp=false;
      for(let dy=-2;dy<=2&&!hasOpp;dy++) for(let dx=-2;dx<=2&&!hasOpp;dx++){
        const nx=qx+dx,ny=qy+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        if(board[ny][nx]?.player===hp) hasOpp=true;
      }
      if(!hasOpp){
        const d=Math.abs(x-qx)+Math.abs(y-qy);
        if(d<closestAnchoredDist) closestAnchoredDist=d;
      }
    }
    if(closestAnchoredDist<=3) bonus+=20; 
  }
  const urgencyMult=threat.anchoredCount>=3?1.6:threat.anchoredCount>=2?1.0:0.5;
  return bonus*urgencyMult;
}

// ─────────────────────────────────────────────────────────────────
//  V5.0 — UNIQUE CAVITY BANKING
// ─────────────────────────────────────────────────────────────────

/**
 * Identifies pieces the AI has that the Human does NOT currently hold.
 * Returns a Set of those "exclusive" piece keys.
 */
function getAiExclusivePieces(aiHand, hpHand) {
  const hpSet = new Set(hpHand);
  return new Set(aiHand.filter(pk => !hpSet.has(pk)));
}

/**
 * For each empty region, checks:
 *  - Can any of the AI's exclusive pieces fit?
 *  - Can any of the Human's pieces fit?
 *
 * Scores highly when the AI has exclusive access to a region the Human cannot touch.
 * Also rewards moves that frame/border such exclusive regions.
 *
 * @returns positive score — higher = better for AI
 */
function uniqueCavityBankingScore(simBoard, W, H, ap, hp, aiHand, hpHand, PENTS, xformFn) {
  if (!aiHand.length || !hpHand) return 0;

  const exclusiveAI = getAiExclusivePieces(aiHand, hpHand);
  if (!exclusiveAI.size) return 0;

  const regions = floodFillRegions(simBoard, W, H);
  const flipOpts = [false, true];
  let totalScore = 0;

  for (const reg of regions) {
    if (reg.length < 5) continue;

    // Only score regions adjacent to AI territory
    let adjAI = false;
    for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && simBoard[ny][nx]?.player === ap) {
          adjAI = true; break;
        }
      }
      if (adjAI) break;
    }
    if (!adjAI) continue;

    // Which of AI's exclusive pieces can fit here?
    const excFitting = [...exclusiveAI].filter(pk =>
      pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn)
    );
    if (!excFitting.length) continue;

    // Can ANY of the human's pieces also fit?
    const hpCanFit = hpHand.some(pk =>
      pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn)
    );

    const isPerfectFit = reg.length === 5;
    const divisible    = reg.length % 5 === 0;
    const parityOk     = getParityDeadZoneScore(reg) === 0;

    if (!hpCanFit) {
      // Pure exclusive zone: AI holds the only keys
      const base = reg.length * (divisible ? 52 : 28);
      const parityBonus = parityOk ? reg.length * 15 : 0;
      const sizeBonus   = isPerfectFit ? 80 : 0;
      totalScore += base + parityBonus + sizeBonus;
    } else {
      // Contested zone but AI has exclusive pieces too → partial credit
      totalScore += reg.length * excFitting.length * 8;
    }
  }

  return totalScore;
}

/**
 * Rewards the current move for framing (bordering) regions that only the AI's
 * exclusive pieces can fill.  Called with the simulated board after placing.
 */
function exclusiveCavityFramingBonus(movAbs, simBoard, W, H, ap, hp, aiHand, hpHand, PENTS, xformFn) {
  if (!aiHand.length) return 0;
  const exclusiveAI = getAiExclusivePieces(aiHand, hpHand);
  if (!exclusiveAI.size) return 0;

  const regions = floodFillRegions(simBoard, W, H);
  const flipOpts = [false, true];
  let bonus = 0;

  for (const reg of regions) {
    if (reg.length < 5) continue;
    const excFitting = [...exclusiveAI].filter(pk =>
      pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn)
    );
    if (!excFitting.length) continue;
    const hpCanFit = hpHand.some(pk => pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn));
    if (hpCanFit) continue;   // Not exclusive

    const regSet = new Set(reg.map(([x, y]) => y * W + x));
    for (const [mx, my] of movAbs) {
      for (const [ox, oy] of DIRS) {
        const nx = mx + ox, ny = my + oy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && regSet.has(ny * W + nx)) {
          bonus += 38; break;
        }
      }
    }
  }
  return bonus;
}

// ─────────────────────────────────────────────────────────────────
//  V5.0 — ANTI-BULKY BOUNDING BOX TRAP SCORER
// ─────────────────────────────────────────────────────────────────

const BULKY_PIECES  = new Set(['I', 'L', 'N', 'Y', 'T', 'Z']);
const COMPACT_PIECES = new Set(['P', 'U', 'F']);

/**
 * Bulky pieces (I, L, N, Y, T, Z) require a minimum bounding box of at least 4×2
 * or 5×1 to be placed.  A 3×2 or 2×3 cavity physically cannot contain any of them.
 *
 * This function scores a simulated board by:
 *  1. Rewarding creation of tight 3×2 / 2×3 regions when the Human holds Bulky pieces.
 *  2. Penalising creation of such regions when the AI itself holds only Bulky pieces.
 *  3. Adding bonus for each Bulky piece the Human has that fits in ZERO post-move regions.
 */
function antiBulkyBoundingBoxScore(simBoard, W, H, ap, hp, aiHand, hpHand, PENTS, xformFn) {
  const humanHasBulky = hpHand.some(pk => BULKY_PIECES.has(pk));
  if (!humanHasBulky) return 0;

  const regions = floodFillRegions(simBoard, W, H);
  const flipOpts = [false, true];
  let score = 0;

  for (const reg of regions) {
    if (reg.length < 5 || reg.length > 7) continue;

    // ── V6.0: Fast cavity archetype detection (no pieceCanFitInRegion needed) ──
    const archetype = detectCavityArchetype(reg);
    const isTightBox = archetype === '3x2'; // 3×2 or 2×3 — hardcoded knowledge

    if (!isTightBox) {
      // Fall back to bounding box check for non-archetyped regions
      let minX = W, maxX = -1, minY = H, maxY = -1;
      for (const [x, y] of reg) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      if (!((boxW <= 3 && boxH <= 2) || (boxW <= 2 && boxH <= 3))) continue;
    }

    // Check adjacency
    let adjHP = false, adjAI = false;
    for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const p = simBoard[ny][nx]?.player;
        if (p === hp) adjHP = true;
        if (p === ap) adjAI = true;
      }
    }

    // ── V6.0: Use hardcoded CANT_FIT_3x2 set — no pieceCanFitInRegion call ──
    const hpBulkyBlocked = hpHand.filter(pk => CANT_FIT_3x2.has(pk)).length;
    const aiCompactFits  = aiHand.filter(pk => CAN_FIT_3x2.has(pk)).length;

    if (adjHP && hpBulkyBlocked > 0) {
      // Trap springs on the human — excellent
      score += hpBulkyBlocked * reg.length * 30;
      if (aiCompactFits > 0) score += aiCompactFits * 40;
    } else if (adjAI && !adjHP) {
      const aiBulkyTrapped = aiHand.filter(pk => CANT_FIT_3x2.has(pk)).length;
      if (aiBulkyTrapped > 0 && aiCompactFits === 0) {
        score -= aiBulkyTrapped * 80;
      }
    }
  }

  // Additional: count how many human bulky pieces are globally stranded
  for (const pk of hpHand) {
    if (!BULKY_PIECES.has(pk)) continue;
    const canPlace = regions.some(reg =>
      reg.length >= 5 && pieceCanFitInRegion(pk, reg, flipOpts, PENTS, xformFn)
    );
    if (!canPlace) score += 220;
  }

  return score;
}

// ═══════════════════════════════════════════════════════════════════
// V6.0 — BITBOARD & ZOBRIST INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════

/**
 * Build per-cell spread-neighbour lookup (BigInt masks) for fast BFS.
 * Cached globally because board dimensions rarely change.
 */
const _spreadCache = new Map();
function buildSpreadLookup(W, H) {
  const key = W + 'x' + H;
  if (_spreadCache.has(key)) return _spreadCache.get(key);
  const N = W * H;
  const sp = new Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0n;
    const i = y * W + x;
    if (x > 0)   m |= (1n << BigInt(i - 1));
    if (x < W-1) m |= (1n << BigInt(i + 1));
    if (y > 0)   m |= (1n << BigInt(i - W));
    if (y < H-1) m |= (1n << BigInt(i + W));
    sp[i] = m;
  }
  _spreadCache.set(key, sp);
  return sp;
}

/** Return BigInt mask of all EMPTY cells in a board array */
function boardToEmptyBig(board, W, H) {
  let m = 0n;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (board[y][x] === null) m |= (1n << BigInt(y * W + x));
  return m;
}

/**
 * Bitwise connected-components on empty cells.
 * Returns [{size, black, white}] — avoids slow array-BFS inside hot loops.
 */
function bbBlobRegions(board, W, H, spreadLookup) {
  let rem = boardToEmptyBig(board, W, H);
  const sl = spreadLookup || buildSpreadLookup(W, H);
  const regions = [];

  while (rem !== 0n) {
    const seed = rem & -rem;
    let reg = seed;
    let frontier = seed;

    while (frontier !== 0n) {
      let spread = 0n;
      let tmp = frontier;
      while (tmp !== 0n) {
        const lsb = tmp & -tmp;
        const bit = bigIntBitIndex(lsb);
        spread |= sl[bit];
        tmp ^= lsb;
      }
      spread &= rem & ~reg;
      reg |= spread;
      frontier = spread;
    }

    // Count cells and checkerboard parity
    let size = 0, black = 0;
    let tmp2 = reg;
    while (tmp2 !== 0n) {
      const lsb = tmp2 & -tmp2;
      const bit = bigIntBitIndex(lsb);
      const x = bit % W, y = (bit / W) | 0;
      size++;
      if ((x + y) % 2 === 0) black++;
      tmp2 ^= lsb;
    }
    regions.push({ size, black, white: size - black });
    rem &= ~reg;
  }
  return regions;
}

/**
 * Fast BigInt trailing-zero count — equivalent to finding the bit index of
 * the least-significant set bit without converting to a string.
 * Uses the identity: lsb = n & -n, so bit index = popcount(lsb - 1).
 * We avoid string conversion entirely by operating in 32-bit halves.
 */
function bigIntBitIndex(lsb) {
  // Split into low and high 32-bit halves
  const lo = Number(lsb & 0xFFFFFFFFn);
  if (lo !== 0) {
    // bit is in the low half — use Math.clz32 on the isolated LSB
    return 31 - Math.clz32(lo & -lo);
  }
  const hi = Number((lsb >> 32n) & 0xFFFFFFFFn);
  return 32 + 31 - Math.clz32(hi & -hi);
}


function bbParityScore(board, W, H, spreadLookup) {
  const blobs = bbBlobRegions(board, W, H, spreadLookup);
  let pen = 0;
  for (const { size, black, white } of blobs) {
    const diff = Math.abs(black - white);
    if (size % 5 !== 0) { pen += diff * 28 + (size % 5) * 18; continue; }
    const k = (size / 5) | 0;
    if (diff > k) pen += (diff - k) * 40 + diff * 22 + size * 4;
    else if ((diff % 2) !== (k % 2)) pen += 30 + diff * 22 + size * 4;
  }
  return pen;
}

// ─── Zobrist Hashing ────────────────────────────────────────────────
let _ztable = null;
function getZobristTable(maxCells) {
  if (_ztable && _ztable.length >= maxCells * 2) return _ztable;
  // Use seeded deterministic values for reproducibility
  const t = new Array(maxCells * 2);
  let s = 0xdeadbeef;
  for (let i = 0; i < t.length; i++) {
    s = Math.imul(s ^ (s >>> 17), 0x45d9f3b) >>> 0;
    s = Math.imul(s ^ (s >>> 7),  0x165667bb) >>> 0;
    const hi = s >>> 0;
    s = Math.imul(s ^ (s >>> 11), 0x1b873593) >>> 0;
    const lo = s >>> 0;
    t[i] = (BigInt(hi) << 32n) | BigInt(lo);
  }
  _ztable = t;
  return t;
}

function boardZobristHash(board, W, H) {
  const N = W * H;
  const zt = getZobristTable(N);
  let h = 0n;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = board[y][x];
    if (!c) continue;
    const i = (y * W + x) * 2 + (c.player === 1 ? 0 : 1);
    h ^= zt[i];
  }
  return h;
}

// ─── Cavity Archetype Detection ─────────────────────────────────────
/**
 * Fast O(N) classification of a region without running pieceCanFitInRegion.
 * Returns 'exact5' | '3x2' | '2x3' | 'cross' | 'large' | 'tiny' | 'other'
 */
function detectCavityArchetype(region) {
  const sz = region.length;
  if (sz < 5)  return 'tiny';
  if (sz > 10) return 'large';

  const xs = region.map(([x]) => x);
  const ys = region.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // Cross: centre cell has 4 filled neighbours inside region (only possible at sz=5)
  if (sz === 5) {
    const regSet = new Set(region.map(([x, y]) => y * 100 + x));
    for (const [cx, cy] of region) {
      let cnt = 0;
      for (const [ox, oy] of DIRS) { if (regSet.has((cy + oy) * 100 + (cx + ox))) cnt++; }
      if (cnt === 4) return 'cross';
    }
    return 'exact5';
  }

  // 3×2 or 2×3 bounding box fully filled
  if ((bw === 3 && bh === 2) || (bw === 2 && bh === 3)) return sz === 6 ? '3x2' : 'other';

  return 'other';
}

/**
 * Pieces that CANNOT fit in a 3×2 / 2×3 bounding box.
 * I, L, N, Y, Z, T all require at least one dimension ≥ 3 AND the other ≥ 2
 * in a straight orientation — they don't fit in a compact 6-cell box.
 * P and U CAN fit. X, W, F, V cannot fit (require more spread).
 */
const CANT_FIT_3x2 = new Set(['I', 'L', 'N', 'Y', 'Z', 'T', 'X', 'W', 'F', 'V']);
const CAN_FIT_3x2  = new Set(['P', 'U']);

// ═══════════════════════════════════════════════════════════════════
// V6.0 — I-PIECE BOARD BISECTION ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Identifies the single best row/column to bisect by placing the I-piece,
 * then returns a score based on how well it divides the board into two
 * independent sub-games of roughly equal size.
 *
 * A true bisection line splits the board into two non-empty connected
 * components when the line is fully blocked.
 */
function iBisectionAnalysis(board, W, H) {
  const EMPTY_THRESHOLD = 4; // min consecutive empties to consider a cut
  let bestLine = null, bestScore = -Infinity;

  // Test each row as a potential horizontal cut
  for (let y = 0; y < H; y++) {
    let emptyRun = 0, maxRun = 0;
    for (let x = 0; x < W; x++) {
      if (board[y][x] === null) { emptyRun++; maxRun = Math.max(maxRun, emptyRun); }
      else emptyRun = 0;
    }
    if (maxRun < 5) continue; // I-piece needs 5 consecutive

    // Estimate sub-game sizes above and below
    let above = 0, below = 0;
    for (let dy = 0; dy < H; dy++)
      for (let dx = 0; dx < W; dx++)
        if (board[dy][dx] === null) (dy < y ? above++ : dy > y ? below++ : 0);

    const balance = Math.abs(above - below);
    const edgeBonus = (y === 0 || y === H - 1) ? 80 : (y === 1 || y === H - 2) ? 30 : 0;
    const score = maxRun * 4 - balance * 0.5 + edgeBonus;
    if (score > bestScore) { bestScore = score; bestLine = { type: 'row', y, score }; }
  }

  // Test each column as a potential vertical cut
  for (let x = 0; x < W; x++) {
    let emptyRun = 0, maxRun = 0;
    for (let y = 0; y < H; y++) {
      if (board[y][x] === null) { emptyRun++; maxRun = Math.max(maxRun, emptyRun); }
      else emptyRun = 0;
    }
    if (maxRun < 5) continue;

    let left = 0, right = 0;
    for (let dy = 0; dy < H; dy++)
      for (let dx = 0; dx < W; dx++)
        if (board[dy][dx] === null) (dx < x ? left++ : dx > x ? right++ : null);

    const balance = Math.abs(left - right);
    const edgeBonus = (x === 0 || x === W - 1) ? 80 : (x === 1 || x === W - 2) ? 30 : 0;
    const score = maxRun * 4 - balance * 0.5 + edgeBonus;
    if (score > bestScore) { bestScore = score; bestLine = { type: 'col', x, score }; }
  }

  return bestLine;
}

// ═══════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────

export function createAiEngine({game,aiPlayer,humanPlayer,aiDifficulty,PENTOMINOES,transformCells,getDraftHistory}){
  const _getDraftHistory=typeof getDraftHistory==='function'?getDraftHistory:()=>[];

  const _moveCache=new Map(),_moveCountCache=new Map(),_feasibleCache=new Map();
  const CACHE_MAX=400;
  function _evict(map){if(map.size>CACHE_MAX) map.delete(map.keys().next().value);}

  let _plan=null,_planSig=null;
  let _oppZone=null,_oppZoneSig=null;
  let _opp=null,_oppBoardSig=null;

  let _masterPlan = null;
  let _masterPlanSig = null;

  // ── Zobrist-based board signature — replaces slow string concat ──
  function _bsig(board,W,H){
    // Return Zobrist hash as hex string (fast XOR-based, not string scan)
    return boardZobristHash(board,W,H).toString(16);
  }
  function _remKey(remaining,p){return(remaining[p]||[]).slice().sort().join('');}
  function _mkKey(prefix,p,board,W,H,rem,placed,flip){
    return prefix+'|'+p+'|'+placed+'|'+(flip?1:0)+'|'+_remKey(rem,p)+'|'+_bsig(board,W,H);
  }

  function movesOnBoard(pNum,board,bW,bH,remaining,placed,allowFlip){
    const k=_mkKey('mv',pNum,board,bW,bH,remaining,placed,allowFlip);
    const c=_moveCache.get(k); if(c) return c;
    const pieces=[...(remaining[pNum]||[])];
    const flipOpts=allowFlip?[false,true]:[false];
    const moves=[];
    for(const pk of pieces){
      const base=PENTOMINOES[pk]; const seen=new Set();
      for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=transformCells(base,rot,flip);
        const oKey=shape.map(([x,y])=>`${x},${y}`).join('|');
        if(seen.has(oKey)) continue; seen.add(oKey);
        for(let ay=0;ay<bH;ay++) for(let ax=0;ax<bW;ax++){
          let valid=true; const abs=[];
          for(const[dx,dy]of shape){
            const x=ax+dx,y=ay+dy;
            if(x<0||y<0||x>=bW||y>=bH||board[y][x]!==null){valid=false;break;}
            abs.push([x,y]);
          }
          if(!valid) continue;
          if(placed>0){
            let touches=false;
            tO:for(const[x,y]of abs) for(const[ox,oy]of DIRS){
              const nx=x+ox,ny=y+oy;
              if(nx>=0&&ny>=0&&nx<bW&&ny<bH&&board[ny][nx]!==null){touches=true;break tO;}
            }
            if(!touches) continue;
          }
          moves.push({pk,rot,flip,ax,ay,abs});
        }
      }
    }
    _moveCache.set(k,moves); _evict(_moveCache); return moves;
  }

  function getAllValidMoves(){
    const{boardW,boardH,board,placedCount,allowFlip,remaining}=game;
    return movesOnBoard(aiPlayer.value,board,boardW,boardH,remaining,placedCount,allowFlip);
  }

  function countFeasiblePieces(board,bW,bH,pNum,rem,placed,allowFlip){
    const k=_mkKey('fe',pNum,board,bW,bH,rem,placed,allowFlip);
    const c=_feasibleCache.get(k); if(c!==undefined) return c;
    const pieces=rem[pNum]||[]; const flipOpts=allowFlip?[false,true]:[false];
    let feasible=0;
    outer:for(const pk of pieces){
      const base=PENTOMINOES[pk]; const seen=new Set();
      for(const flip of flipOpts) for(let rot=0;rot<4;rot++){
        const shape=transformCells(base,rot,flip);
        const oKey=shape.map(([x,y])=>`${x},${y}`).join('|');
        if(seen.has(oKey)) continue; seen.add(oKey);
        for(let ay=0;ay<bH;ay++) for(let ax=0;ax<bW;ax++){
          let valid=true;
          for(const[dx,dy]of shape){
            const x=ax+dx,y=ay+dy;
            if(x<0||y<0||x>=bW||y>=bH||board[y][x]!==null){valid=false;break;}
          }
          if(!valid) continue;
          if(placed>0){
            let touches=false;
            tO:for(const[dx,dy]of shape){
              const px=ax+dx,py=ay+dy;
              for(const[ox,oy]of DIRS){
                const nx=px+ox,ny=py+oy;
                if(nx>=0&&ny>=0&&nx<bW&&ny<bH&&board[ny][nx]!==null){touches=true;break tO;}
              }
            }
            if(!touches) continue;
          }
          feasible++; continue outer;
        }
      }
    }
    _feasibleCache.set(k,feasible); _evict(_feasibleCache); return feasible;
  }

  function countTotalMoves(board,bW,bH,pNum,rem,placed,allowFlip){
    const k=_mkKey('mc',pNum,board,bW,bH,rem,placed,allowFlip);
    const c=_moveCountCache.get(k); if(c!==undefined) return c;
    const v=movesOnBoard(pNum,board,bW,bH,rem,placed,allowFlip).length;
    _moveCountCache.set(k,v); _evict(_moveCountCache); return v;
  }

  function cornerControlBonus(board,W,H,ap,hp){
    const corners=[[0,0],[W-1,0],[0,H-1],[W-1,H-1]];
    let aiScore=0,hpScore=0;
    for(const[cx,cy]of corners){
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
        if(Math.abs(dx)+Math.abs(dy)>2) continue;
        const nx=cx+dx,ny=cy+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const dist=Math.abs(dx)+Math.abs(dy);
        const weight=dist===0?4:dist===1?2.5:1;
        const p=board[ny][nx]?.player;
        if(p===ap) aiScore+=weight;
        else if(p===hp) hpScore+=weight;
      }
    }
    return aiScore-hpScore;
  }

  function quickScore(simBoard,ap,hp,bW,bH){
    const t=territoryAdvantage(simBoard,bW,bH,ap,hp);
    const regs=floodFillRegions(simBoard,bW,bH);
    const trap=regionFeasibilityBonus(regs,simBoard,bW,bH,hp);
    const fr=frontierScore(simBoard,bW,bH,ap,hp);
    const largest=regs.length?regs.reduce((a,b)=>b.length>a.length?b:a,regs[0]):null;
    const openZ=largest?largest.length*0.18:0;
    const cluster=aiClusterPenalty(simBoard,bW,bH,ap);
    const seal=territorySealScore(simBoard,bW,bH,ap,hp,regs);
    const cornerCtrl=cornerControlBonus(simBoard,bW,bH,ap,hp);
    return t*12+trap*0.25+fr*0.9+openZ+cluster*1.5+seal*0.4+cornerCtrl*3;
  }

  function connectivityBeam(moves,board,bW,bH,ap,hp,beamSize){
    if(!moves.length) return[];

    // V5.2 FIX: Removed connected/disconnected split bias.
    // Original code forced 75% connected moves into the beam, causing tunnel vision:
    // the AI would build a single blob instead of sprawling to block opponent lanes.
    // Pure quickScore ranking means a well-placed disconnected move (e.g. seeding a
    // second territory zone) can beat a mediocre connected move on merit alone.

    const MAX_PRESCORE = beamSize * 8;
    let candidates = moves;
    if (moves.length > MAX_PRESCORE) {
      // Stratified sample by piece type — preserves diversity across all piece keys
      // so every piece type gets representation in the scored pool.
      const byPk = new Map();
      for (const m of moves) {
        if (!byPk.has(m.pk)) byPk.set(m.pk, []);
        byPk.get(m.pk).push(m);
      }
      const out = [];
      const perPk = Math.ceil(MAX_PRESCORE / byPk.size);
      for (const bucket of byPk.values()) {
        const step = Math.max(1, Math.floor(bucket.length / perPk));
        for (let i = 0; i < bucket.length && out.length < MAX_PRESCORE; i += step) {
          out.push(bucket[i]);
        }
      }
      candidates = out;
    }

    const scored = [];
    for (const m of candidates) {
      const sim = board.map(r => [...r]);
      for (const [x,y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
      scored.push({ m, s: quickScore(sim, ap, hp, bW, bH) });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, beamSize);
  }

  function simulateOppResponse(simBoard,ap,hp,bW,bH,rem,placed,allowFlip){
    const oppMoves=movesOnBoard(hp,simBoard,bW,bH,rem,placed,allowFlip);
    if(!oppMoves.length) return quickScore(simBoard,ap,hp,bW,bH);
    const beamN=Math.min(18,oppMoves.length);
    const scored=oppMoves.map(m=>{
      const after=simBoard.map(r=>[...r]);
      for(const[x,y]of m.abs) after[y][x]={player:hp,pieceKey:m.pk};
      return{m,s:quickScore(after,ap,hp,bW,bH)};
    }).sort((a,b)=>a.s-b.s);
    let worst=Infinity;
    for(const{m}of scored.slice(0,beamN)){
      const after=simBoard.map(r=>[...r]);
      for(const[x,y]of m.abs) after[y][x]={player:hp,pieceKey:m.pk};
      const s=quickScore(after,ap,hp,bW,bH);
      if(s<worst) worst=s;
    }
    return worst;
  }

  function solveTiling(hand, board, W, H, allowFlip, PENTS, xformFn, timeLimitMs) {
    const deadline = Date.now() + timeLimitMs;
    const flipOpts = allowFlip ? [false, true] : [false];
    
    const sortedHand = [...hand].sort((a, b) => {
      const constraints = { X: 10, W: 9, U: 8, F: 7, I: 6, L: 5, N: 5, Y: 4, Z: 3, P: 2, T: 1, V: 0 };
      return (constraints[b] || 0) - (constraints[a] || 0);
    });

    let bestTiling = null;
    let maxPiecesPlaced = 0;

    function backtrack(boardState, piecesLeft, currentTiling) {
      if (Date.now() > deadline) return;
      
      if (piecesLeft.length === 0) {
        bestTiling = [...currentTiling];
        maxPiecesPlaced = currentTiling.length;
        return true; 
      }

      if (currentTiling.length > maxPiecesPlaced) {
        maxPiecesPlaced = currentTiling.length;
        bestTiling = [...currentTiling];
      }

      const pk = piecesLeft[0];
      const remaining = piecesLeft.slice(1);
      
      const placements = getPiecePlacements(pk, boardState, W, H, flipOpts, PENTS, xformFn);
      
      for (const abs of placements) {
        let touches = currentTiling.length === 0;
        if (!touches) {
          outer: for (const [x, y] of abs) {
            for (const [ox, oy] of DIRS) {
              const nx = x + ox, ny = y + oy;
              if (nx >= 0 && nx < W && ny >= 0 && ny < H && boardState[ny][nx] !== null) {
                touches = true; break outer;
              }
            }
          }
        }
        if (!touches) continue;

        for (const [x, y] of abs) boardState[y][x] = { pieceKey: pk };
        currentTiling.push({ pk, abs });

        const success = backtrack(boardState, remaining, currentTiling);
        if (success) return true;

        currentTiling.pop();
        for (const [x, y] of abs) boardState[y][x] = null;
      }
      return false;
    }

    backtrack(board.map(r => [...r]), sortedHand, []);
    return bestTiling;
  }

  function getOrComputePlan(hand,board,W,H,ap,hp,allowFlip,opp){
    const sig=_bsig(board,W,H)+'|'+hand.slice().sort().join('');
    if(_plan&&_planSig===sig) return _plan;
    if(_plan&&isZoneIntruded(_plan,board,W,H,hp)) _plan=null;

    if(opp?.pivotZone&&(!_plan||opp.pivotZone.score>(_plan.score||0)*1.1)){
      _plan=opp.pivotZone;
      _planSig=sig;
      return _plan;
    }

    const plan=findBestTerritoryZone(hand,board,W,H,ap,hp,allowFlip,PENTOMINOES,transformCells);
    _plan=plan; _planSig=sig; return _plan;
  }

  function getOrScanOpportunities(board,W,H,ap,hp,aiHand,allowFlip){
    const sig=_bsig(board,W,H);
    if(_opp&&_oppBoardSig===sig) return _opp;
    _opp=scanOpportunities(board,W,H,ap,hp,aiHand,_plan,allowFlip,PENTOMINOES,transformCells);
    _oppBoardSig=sig;
    return _opp;
  }

  function endgameSolve(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const diff=aiDifficulty.value;
    const aiHand=remaining[ap]||[];
    const useRes=(diff==='expert'||diff==='master'||diff==='ultimate')&&aiHand.length>3;
    const keyPieces=useRes?identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells):null;
    const plan=_plan;

    // FIX A: For ultimate mode with ≤3 pieces left, try solveTiling first.
    // This finds a provably-complete packing order instead of relying on heuristics.
    if((diff==='ultimate'||diff==='expert')&&aiHand.length<=3&&aiHand.length>=1){
      const tilingResult=solveTiling(aiHand,board,boardW,boardH,allowFlip,PENTOMINOES,transformCells,400);
      if(tilingResult&&tilingResult.length===aiHand.length){
        // Found a complete packing — play the first step of the solution
        const firstStep=tilingResult[0];
        const matchingMove=moves.find(m=>{
          if(m.pk!==firstStep.pk) return false;
          if(m.abs.length!==firstStep.abs.length) return false;
          return m.abs.every(([x,y],i)=>firstStep.abs[i][0]===x&&firstStep.abs[i][1]===y);
        });
        if(matchingMove) return matchingMove;
        // Tiling found but position mismatch — still use tiling pk to guide choice
        const pkMoves=moves.filter(m=>m.pk===firstStep.pk);
        if(pkMoves.length===1) return pkMoves[0];
      }
    }

    const egPlacementCounts=(diff==='expert'||diff==='master'||diff==='ultimate')
      ?computePiecePlacementCounts(aiHand,board,boardW,boardH,placedCount,allowFlip,PENTOMINOES,transformCells)
      :null;

    let best=null,bestScore=-Infinity;
    for(const m of moves){
      const sim=board.map(r=>[...r]);
      for(const[x,y]of m.abs) sim[y][x]={player:ap,pieceKey:m.pk};
      let aiC=0,hpC=0;
      for(let y=0;y<boardH;y++) for(let x=0;x<boardW;x++){
        const p=sim[y][x]?.player;
        if(p===ap) aiC++; else if(p===hp) hpC++;
      }
      const regions=floodFillRegions(sim,boardW,boardH);
      const rem={[ap]:aiHand.filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};

      // FIX A: Joint feasibility — penalise moves that leave remaining pieces unpackable together
      let jointFeasPenalty=0;
      if(rem[ap].length>=2){
        const jointTiling=solveTiling(rem[ap],sim,boardW,boardH,allowFlip,PENTOMINOES,transformCells,120);
        if(!jointTiling||jointTiling.length<rem[ap].length){
          // Can't pack all remaining pieces after this move — heavy disqualification
          jointFeasPenalty=-9999;
        }
      }

      let score=(aiC-hpC)*22+regionFeasibilityBonus(regions,sim,boardW,boardH,hp)*1.6
              +territoryAdvantage(sim,boardW,boardH,ap,hp)*8+aiClusterPenalty(sim,boardW,boardH,ap)*1.5
              +sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*4
              +territorySealScore(sim,boardW,boardH,ap,hp)*2.5
              +zoneSealBonus(regions,board,sim,boardW,boardH,hp)*2.5
              +allPiecesViabilityScore(sim,boardW,boardH,rem[ap],placedCount+1,allowFlip,PENTOMINOES,transformCells)*25.0
              +jointFeasPenalty;
      if(plan) score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*3;
      if(keyPieces) score+=pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiHand.length)*1.2;
      // FIX E: include opponent lookahead for ultimate (previously expert/master only)
      if(diff==='expert'||diff==='master'||diff==='ultimate'){
        const ra={[ap]:rem[ap],[hp]:[...(remaining[hp]||[])]};
        const omEG=movesOnBoard(hp,sim,boardW,boardH,ra,placedCount+1,allowFlip);
        if(omEG.length){
          let worst=Infinity;
          for(const om of omEG.slice(0,12)){
            const af=sim.map(r=>[...r]);
            for(const[x,y]of om.abs) af[y][x]={player:hp,pieceKey:om.pk};
            const s=quickScore(af,ap,hp,boardW,boardH);
            if(s<worst) worst=s;
          }
          score+=worst*0.5;
        }
      }
      if(egPlacementCounts){
        score+=placementCountGradientPenalty(rem[ap], egPlacementCounts) * 8.0;
      }
      if(score>bestScore){bestScore=score;best=m;}
    }
    return best;
  }

  function movesEasy(moves){
    if(!moves.length) return null;
    if(Math.random()<0.80) return moves[Math.floor(Math.random()*moves.length)];
    const{board,boardW,boardH}=game; const hp=humanPlayer.value;
    let best=null,bScore=-Infinity;
    for(const m of moves){
      let s=Math.random()*2;
      for(const[x,y]of m.abs) for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=boardW||ny>=boardH) continue;
        if(board[ny][nx]?.player===hp) s+=1;
      }
      if(s>bScore){bScore=s;best=m;}
    }
    return best;
  }

  function movesNormal(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    let best=null,bScore=-Infinity;
    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    for(const m of moves){
      const sim=board.map(r=>[...r]);
      for(const[x,y]of m.abs) sim[y][x]={player:ap,pieceKey:m.pk};
      let s=territoryAdvantage(sim,boardW,boardH,ap,hp)*2.5
           +frontierScore(sim,boardW,boardH,ap,hp)*0.4;
      for(const[x,y]of m.abs) for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=boardW||ny>=boardH) continue;
        const p=board[ny][nx]?.player;
        if(p===ap) s+=2; else if(p===hp) s+=1;
      }
      const rem={[ap]:(remaining[ap]||[]).filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
      const regs=floodFillRegions(sim,boardW,boardH);
      s+=regionFeasibilityBonus(regs,sim,boardW,boardH,hp)*0.25;
      const oppMobAfter=countTotalMoves(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      s+=(oppMobBefore-oppMobAfter)*0.4;
      s+=pieceEfficiencyScore(m.abs,sim,boardW,boardH,ap)*0.12;
      s+=Math.random()*0.3; 
      if(s>bScore){bScore=s;best=m;}
    }
    return best;
  }

  function movesTactician(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    if((remaining[ap]?.length||0)<=3||(remaining[hp]?.length||0)<=3) return endgameSolve(moves);

    const aiHand=remaining[ap]||[];
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,null); 
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const baseBeam=isMirrorWar(boardW,boardH)?18:30;
    const regionCount=floodFillRegions(board,boardW,boardH).length;
    const adaptiveBeam=baseBeam+Math.min(20,Math.max(0,regionCount-3)*4);
    const beam=connectivityBeam(moves,board,boardW,boardH,ap,hp,adaptiveBeam);

    let best=null,bScore=-Infinity;
    for(const{m}of beam){
      const sim=board.map(r=>[...r]);
      for(const[x,y]of m.abs) sim[y][x]={player:ap,pieceKey:m.pk};
      const rem={[ap]:(remaining[ap]||[]).filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
      const regs=floodFillRegions(sim,boardW,boardH);

      let score=
          territoryAdvantage(sim,boardW,boardH,ap,hp)*14
         +regionFeasibilityBonus(regs,sim,boardW,boardH,hp)*1.5
         +zoneSealBonus(regs,board,sim,boardW,boardH,hp)*2
         +frontierScore(sim,boardW,boardH,ap,hp)*1
         +pieceEfficiencyScore(m.abs,sim,boardW,boardH,ap)*1
         +openTerritoryBonus(m.abs,sim,boardW,boardH,ap)*1.5
         +aiClusterPenalty(sim,boardW,boardH,ap);

      const oppMobAfter=countTotalMoves(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      score+=(oppMobBefore-oppMobAfter)*3.5;
      const oppFeaAfter=countFeasiblePieces(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      score-=oppFeaAfter*6+(oppFeaBefore-oppFeaAfter)*(-10);

      if(plan){
        let pw=3.5; if(seal&&seal.progress>0.7) pw=7;
        score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*pw;
      }

      score+=opportunityBonus(m.abs,{...opp,pivotZone:null,strandedCells:[]},board,sim,boardW,boardH,ap,hp,0.5);
      score+=sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*3;
      score+=territorySealScore(sim,boardW,boardH,ap,hp)*1.5;
      score+=endgameParityScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)*2.5;
      score+=simulateOppResponse(sim,ap,hp,boardW,boardH,rem,placedCount+1,allowFlip)*0.7;

      if(score>bScore){bScore=score;best=m;}
    }
    return best;
  }

  function movesGrandmaster(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const aiPC=(remaining[ap]||[]).length,hpPC=(remaining[hp]||[]).length;
    const totalPieces=aiPC+hpPC;
    const mw=isMirrorWar(boardW,boardH);
    if(aiPC<=3||hpPC<=3) return endgameSolve(moves);

    const dw=getDynamicWeights(board,boardW,boardH,ap,hp,placedCount,totalPieces);
    const aiHand=remaining[ap]||[];

    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,opp);
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;
    const zoneSealed=seal?.isSealed??false;
    const cavityPlan=buildPieceCavityPlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,PENTOMINOES,transformCells);

    const hpHand=remaining[hp]||[];
    const oppCavity=detectOpponentCavity(board,boardW,boardH,hp,hpHand,allowFlip,PENTOMINOES,transformCells);

    const keyPieces=identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells);
    if(plan) for(const pk of plan.pieces) keyPieces.set(pk,(keyPieces.get(pk)||0)+60);

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const baseBeam=mw?35:55;
    const regionCount=floodFillRegions(board,boardW,boardH).length;
    const adaptiveBeam=baseBeam+Math.min(30,Math.max(0,regionCount-3)*5);
    const beam=connectivityBeam(moves,board,boardW,boardH,ap,hp,adaptiveBeam);
    const preAPs=findArticulationPoints(board,boardW,boardH);

    let best=null,bScore=-Infinity;
    for(const{m}of beam){
      const sim=board.map(r=>[...r]);
      for(const[x,y]of m.abs) sim[y][x]={player:ap,pieceKey:m.pk};
      const rem={[ap]:(remaining[ap]||[]).filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
      const regs=floodFillRegions(sim,boardW,boardH);

      let score=territoryAdvantage(sim,boardW,boardH,ap,hp)*32*dw.earlyBoost;

      const oppMobAfter=countTotalMoves(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      score+=(oppMobBefore-oppMobAfter)*14;
      score+=regionFeasibilityBonus(regs,sim,boardW,boardH,hp)*3*dw.lateBoost;
      score+=zoneSealBonus(regs,board,sim,boardW,boardH,hp)*2.5;
      score+=frontierScore(sim,boardW,boardH,ap,hp)*2.5;
      score+=pieceEfficiencyScore(m.abs,sim,boardW,boardH,ap)*2;
      score+=openTerritoryBonus(m.abs,sim,boardW,boardH,ap,regs)*2;
      score+=aiClusterPenalty(sim,boardW,boardH,ap)*2.5;

      for(const reg of regs){
        if(reg.length<=4) score+=(5-reg.length)*18;
        if(reg.length%5===0) score-=2.5;
      }

      const ownFea=countFeasiblePieces(sim,boardW,boardH,ap,rem,placedCount+1,allowFlip);
      const oppFea=countFeasiblePieces(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      score+=ownFea*20-oppFea*28+(oppFeaBefore-oppFea)*26*dw.lateBoost;

      if(plan){
        let pw=zoneSealed?4:7*dw.earlyBoost;
        if(!zoneSealed&&seal&&seal.progress>0.5) pw*=1.5;
        if(!zoneSealed&&seal&&seal.progress>0.8) pw*=2;
        score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*pw;
      }

      score+=opportunityBonus(m.abs,opp,board,sim,boardW,boardH,ap,hp,1.0);
      score+=articulationCutBonus(m.abs,board,sim,boardW,boardH,ap,hp,preAPs,regs)*2;
      score+=territorySealScore(sim,boardW,boardH,ap,hp)*2;
      score+=boardSplitBonus(m.abs,board,sim,boardW,boardH,ap,hp)*2.5;

      if(dw.progress>(mw?0.4:0.2))
        score+=opponentShapeReadScore(sim,boardW,boardH,hp,rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)*dw.lateBoost*1.5;

      score+=selfShapeReadScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)*1.8;
      score+=cavityFramingBonus(m.abs,cavityPlan,sim,boardW,boardH,ap)*2.0;
      score+=opponentCavityIntrusionBonus(m.abs,oppCavity,boardW)*2.0;

      score+=pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiPC)*2;
      score+=sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*2.5;
      score+=endgameParityScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)*2.5;
      score+=(hpHand.includes('I')?iLaneClosingBonus(m.abs,board,sim,boardW,boardH)*1.8:0);

      const oppMoves=movesOnBoard(hp,sim,boardW,boardH,rem,placedCount+1,allowFlip);
      let lookahead=0;
      if(oppMoves.length){
        const oppBeam=Math.min(mw?14:28,oppMoves.length);
        const oppScored=oppMoves.map(om=>{
          const ao=sim.map(r=>[...r]);
          for(const[x,y]of om.abs) ao[y][x]={player:hp,pieceKey:om.pk};
          return{om,s:quickScore(ao,ap,hp,boardW,boardH)};
        }).sort((a,b)=>a.s-b.s);
        let wBoard=null,wRem=null,wS=Infinity;
        for(const{om}of oppScored.slice(0,oppBeam)){
          const ao=sim.map(r=>[...r]);
          for(const[x,y]of om.abs) ao[y][x]={player:hp,pieceKey:om.pk};
          const s=quickScore(ao,ap,hp,boardW,boardH);
          if(s<wS){wS=s;wBoard=ao;wRem={[ap]:[...(rem[ap]||[])],[hp]:(rem[hp]||[]).filter(k=>k!==om.pk)};}
        }
        if(wBoard){
          const viabAfterHuman=allPiecesViabilityScore(wBoard,boardW,boardH,wRem[ap],placedCount+2,allowFlip,PENTOMINOES,transformCells);
          wS+=viabAfterHuman; 
          const fMoves=movesOnBoard(ap,wBoard,boardW,boardH,wRem,placedCount+2,allowFlip);
          if(fMoves.length){
            const fBeam=Math.min(mw?14:28,fMoves.length);
            let bFollow=-Infinity;
            for(const fm of fMoves.slice(0,fBeam)){
              const af=wBoard.map(r=>[...r]);
              for(const[x,y]of fm.abs) af[y][x]={player:ap,pieceKey:fm.pk};
              const s=quickScore(af,ap,hp,boardW,boardH)
                      +allPiecesViabilityScore(af,boardW,boardH,wRem[ap].filter(k=>k!==fm.pk),placedCount+3,allowFlip,PENTOMINOES,transformCells);
              if(s>bFollow) bFollow=s;
            }
            lookahead=(bFollow+wS)*0.5;
          } else lookahead=wS;
        }
      }
      score+=lookahead*18;
      if(dw.aggression<1) score*=(0.85+dw.aggression*0.15);

      if(score>bScore){bScore=score;best=m;}
    }
    return best;
  }

  function movesLegendary(moves,returnTopK=0){
    if(!moves.length) return returnTopK>0?[]:null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const aiPC=(remaining[ap]||[]).length,hpPC=(remaining[hp]||[]).length;
    const totalPieces=aiPC+hpPC;
    const mw=isMirrorWar(boardW,boardH);
    if(aiPC<=3||hpPC<=3){
      const eg=endgameSolve(moves);
      return returnTopK>0?(eg?[eg]:[]):eg;
    }

    const aiHand_pre=remaining[ap]||[];
    if(aiHand_pre.length>1){
      const flipOpts_pre=allowFlip?[false,true]:[false];
      let minCnt=Infinity,minPk=null;
      for(const pk of aiHand_pre){
        let cnt=0;
        const base=PENTOMINOES[pk]; const seen=new Set();
        outer_pre:for(const flip of flipOpts_pre) for(let rot=0;rot<4;rot++){
          const shape=transformCells(base,rot,flip);
          const oKey=shape.map(([x,y])=>`${x},${y}`).join('|');
          if(seen.has(oKey)) continue; seen.add(oKey);
          for(let ay=0;ay<boardH;ay++) for(let ax=0;ax<boardW;ax++){
            let valid=true; const abs=[];
            for(const[dx,dy]of shape){
              const x=ax+dx,y=ay+dy;
              if(x<0||y<0||x>=boardW||y>=boardH||board[y][x]!==null){valid=false;break;}
              abs.push([x,y]);
            }
            if(!valid) continue;
            if(placedCount>0){
              let touches=false;
              tO_pre:for(const[x,y]of abs) for(const[ox,oy]of DIRS){
                const nx=x+ox,ny=y+oy;
                if(nx>=0&&ny>=0&&nx<boardW&&ny<boardH&&board[ny][nx]!==null){touches=true;break tO_pre;}
              }
              if(!touches) continue;
            }
            cnt++; if(cnt>=2) break outer_pre; 
          }
        }
        if(cnt<minCnt){minCnt=cnt;minPk=pk;}
      }
      if(minCnt<=1&&minPk){
        const filtered=moves.filter(m=>m.pk===minPk);
        if(filtered.length){
          if(filtered.length===1) return returnTopK>0?[filtered[0]]:filtered[0];
          moves=filtered; 
        }
      }
    }
    const _topKK=returnTopK;
    const _topKList=returnTopK>0?[]:null;
    const dw=getDynamicWeights(board,boardW,boardH,ap,hp,placedCount,totalPieces);
    const aggMult=Math.max(1,dw.aggression);
    const aiHand=remaining[ap]||[];
    const hpHand=remaining[hp]||[];

    const placementCounts=computePiecePlacementCounts(aiHand,board,boardW,boardH,placedCount,allowFlip,PENTOMINOES,transformCells);

    if(hpHand.includes('I')&&aiHand.includes('T')){
      const laneCountNow=countReachableILanes(board,boardW,boardH);
      if(laneCountNow>=2) placementCounts.set('T',0); 
    }

    const aiElongated=aiHand.filter(p=>CONSTRAINED_URGENT_SET.includes(p));
    if(hpHand.includes('I')&&aiElongated.length){
      const iMoves=movesOnBoard(hp,board,boardW,boardH,remaining,placedCount,allowFlip)
        .filter(mv=>mv.pk==='I');
      for(const im of iMoves){
        const simI=board.map(r=>[...r]);
        for(const[x,y]of im.abs) simI[y][x]={player:hp,pieceKey:'I'};
        for(const pk of aiElongated){
          if(!pieceHasAnyPlacement(simI,pk,boardW,boardH,placedCount+1,allowFlip,PENTOMINOES,transformCells)){
            const cur=placementCounts.get(pk)??999;
            placementCounts.set(pk,Math.min(cur,1)); 
          }
        }
      }
    }

    const elongHandNow=aiHand.filter(p=>CONSTRAINED_URGENT_SET.includes(p));
    if(elongHandNow.length>=2&&moves.length>1){
      let minElongCnt=Infinity, minElongPk=null;
      for(const pk of elongHandNow){
        const c=placementCounts.get(pk)??999;
        if(c<minElongCnt){minElongCnt=c;minElongPk=pk;}
      }
      const allCounts=[...placementCounts.entries()];
      const overallMin=Math.min(...allCounts.map(([,v])=>v));
      const overallMinPk=allCounts.find(([,v])=>v===overallMin)?.[0];
      if(overallMinPk&&!CONSTRAINED_URGENT_SET.includes(overallMinPk)&&minElongPk){
        const filtered=moves.filter(m=>m.pk===minElongPk);
        if(filtered.length) moves=filtered;
      } else {
        const urgentCap=elongHandNow.length>=3?1:2;
        for(const pk of elongHandNow){
          const cur=placementCounts.get(pk)??999;
          placementCounts.set(pk,Math.min(cur,urgentCap));
        }
      }
    }

    const totalCells=boardW*boardH;
    const occupiedCells=board.flat().filter(c=>c!==null).length;
    if(occupiedCells/totalCells>0.40&&aiHand.length>1){
      for(const [pk,cnt] of placementCounts.entries()){
        if(cnt<5&&cnt>1){ 
          placementCounts.set(pk,Math.min(cnt,2)); 
        }
      }
    }

    if (placedCount === 0 && !_masterPlan) {
      _masterPlan = solveTiling(aiHand, board, boardW, boardH, allowFlip, PENTOMINOES, transformCells, 500);
    }

    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,opp);
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;
    const zoneSealed=seal?.isSealed??false;

    const cavityPlan=buildPieceCavityPlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,PENTOMINOES,transformCells);
    const oppCavity=detectOpponentCavity(board,boardW,boardH,hp,hpHand,allowFlip,PENTOMINOES,transformCells);
    const forkThreat=detectForkThreat(board,boardW,boardH,hp,hpHand,allowFlip,PENTOMINOES,transformCells);

    const oppSig=_bsig(board,boardW,boardH)+'|opp|'+hpHand.slice().sort().join('');
    if(!_oppZone||_oppZoneSig!==oppSig){
      _oppZone=predictOpponentZone(hpHand,board,boardW,boardH,ap,hp,allowFlip,PENTOMINOES,transformCells);
      _oppZoneSig=oppSig;
    }

    const keyPieces=identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells);
    if(plan) for(const pk of plan.pieces) keyPieces.set(pk,(keyPieces.get(pk)||0)+80);

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    // Hard cap beam on early placements — empty board has 1000+ moves,
    // connectivityBeam scores every one with quickScore which is very expensive.
    const earlyGame = placedCount <= 2;
    const baseBeamL = earlyGame ? 18 : (mw ? 40 : 65);
    const regionCountL=floodFillRegions(board,boardW,boardH).length;
    const adaptiveBeamL = earlyGame ? baseBeamL : baseBeamL+Math.min(30,Math.max(0,regionCountL-3)*5);
    const beam=connectivityBeam(moves,board,boardW,boardH,ap,hp,adaptiveBeamL);
    const preAPs=findArticulationPoints(board,boardW,boardH);

    let best=null,bScore=-Infinity;
    for(const{m}of beam){
      const sim=board.map(r=>[...r]);
      for(const[x,y]of m.abs) sim[y][x]={player:ap,pieceKey:m.pk};
      const rem={[ap]:(remaining[ap]||[]).filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
      const regs=floodFillRegions(sim,boardW,boardH);

      const tAdv=territoryAdvantage(sim,boardW,boardH,ap,hp);
      const infB=regionFeasibilityBonus(regs,sim,boardW,boardH,hp);
      const sealB=zoneSealBonus(regs,board,sim,boardW,boardH,hp);
      const frontCtrl=frontierScore(sim,boardW,boardH,ap,hp);
      const eff=pieceEfficiencyScore(m.abs,sim,boardW,boardH,ap);

      let exposure=0;
      for(const[x,y]of m.abs) for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx<0||ny<0||nx>=boardW||ny>=boardH) continue;
        if(sim[ny][nx]?.player===hp) exposure++;
      }

      const oppMobAfter=countTotalMoves(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      const mobRed=oppMobBefore-oppMobAfter;
      const ownFea=countFeasiblePieces(sim,boardW,boardH,ap,rem,placedCount+1,allowFlip);
      const oppFea=countFeasiblePieces(sim,boardW,boardH,hp,rem,placedCount+1,allowFlip);
      const feaRed=oppFeaBefore-oppFea;
      const blunder=ownFea<=2?-280:ownFea<=4?-70:ownFea<=6?-18:0;

      let planBonus=0;
      if(plan){
        let pw=zoneSealed?5:10*dw.earlyBoost;
        if(!zoneSealed&&seal&&seal.progress>0.5) pw*=1.8;
        if(!zoneSealed&&seal&&seal.progress>0.8) pw*=2.5;
        planBonus=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*pw;
      }

      if (_masterPlan) {
        let matched = false;
        for (const planned of _masterPlan) {
          if (planned.pk === m.pk) {
            let matchesAll = true;
            for (let i = 0; i < m.abs.length; i++) {
               if (m.abs[i][0] !== planned.abs[i][0] || m.abs[i][1] !== planned.abs[i][1]) {
                 matchesAll = false; break;
               }
            }
            if (matchesAll) matched = true;
          }
        }
        if (matched) planBonus += 1000;
      }

      const oppBonus=opportunityBonus(m.abs,opp,board,sim,boardW,boardH,ap,hp,1.5);
      const disrupt=_oppZone?opponentZoneDisruptBonus(m.abs,_oppZone,boardW,boardH)*2.5:0;
      const apBonus=articulationCutBonus(m.abs,board,sim,boardW,boardH,ap,hp,preAPs,regs);
      const splitBonus=boardSplitBonus(m.abs,board,sim,boardW,boardH,ap,hp);
      const sealTerr=territorySealScore(sim,boardW,boardH,ap,hp,regs);
      const shapeRead=dw.progress>(mw?0.35:0.15)
        ?opponentShapeReadScore(sim,boardW,boardH,hp,rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)*aggMult
        :0;

      const selfShapeRead=selfShapeReadScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells);

      const pairTerrScore=(aiHand.includes('P')&&aiHand.includes('U'))
        ?pairExclusiveTerritoryScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)
        :0;

      const comboSetup=aiHand.length>=3
        ?comboCavitySetupBonus(m.abs,m.pk,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)
        :0;

      const iLaneFence=aiHand.includes('I')&&m.pk!=='I'
        ?iLaneFencingBonus(m.abs,m.pk,board,sim,boardW,boardH,aiHand,hpHand,allowFlip,PENTOMINOES,transformCells)
        :0;

      const excCavity=exclusivePieceCavityBonus(m.abs,m.pk,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells);
      const antiExclusive=antiExclusiveTerritoryBonus(m.abs,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells);

      const forkCounter=forkThreat.active
        ?forkCounterBonus(m.abs,board,sim,boardW,boardH,ap,hp,forkThreat)
        :0;

      const coopCavPenalty=cooperativeCavityPenalty(m.abs,m.pk,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells);
      const abandonedZone=abandonedZonePenalty(m.abs,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells);
      const dualAnchorCounter=dualAnchorCounterBonus(m.abs,board,boardW,boardH,ap,hp);

      const oppMoves=movesOnBoard(hp,sim,boardW,boardH,rem,placedCount+1,allowFlip);
      let lookahead=0;
      if(oppMoves.length){
        const oppBeam=Math.min(mw?18:45,oppMoves.length);
        const checkOppViab=rem[ap].some(p=>CONSTRAINED_URGENT_SET.includes(p));
        const oppScored=oppMoves.map(om=>{
          const ao=sim.map(r=>[...r]);
          for(const[x,y]of om.abs) ao[y][x]={player:hp,pieceKey:om.pk};
          const qs=quickScore(ao,ap,hp,boardW,boardH);
          const remAfterOpp={[ap]:[...(rem[ap]||[])],[hp]:(rem[hp]||[]).filter(k=>k!==om.pk)};
          const viab=checkOppViab
            ?allPiecesViabilityScore(ao,boardW,boardH,remAfterOpp[ap],placedCount+2,allowFlip,PENTOMINOES,transformCells)
            :0;
          return{om,s:qs+viab*0.6}; 
        }).sort((a,b)=>a.s-b.s);
        let wBoard=null,wRem=null,wS=Infinity;
        for(const{om}of oppScored.slice(0,oppBeam)){
          const ao=sim.map(r=>[...r]);
          for(const[x,y]of om.abs) ao[y][x]={player:hp,pieceKey:om.pk};
          const remAfterOpp={[ap]:[...(rem[ap]||[])],[hp]:(rem[hp]||[]).filter(k=>k!==om.pk)};
          const viab=checkOppViab
            ?allPiecesViabilityScore(ao,boardW,boardH,remAfterOpp[ap],placedCount+2,allowFlip,PENTOMINOES,transformCells)
            :0;
          const s=quickScore(ao,ap,hp,boardW,boardH)+viab*0.6;
          if(s<wS){wS=s;wBoard=ao;wRem=remAfterOpp;}
        }
        if(wBoard){
          const fMoves=movesOnBoard(ap,wBoard,boardW,boardH,wRem,placedCount+2,allowFlip);
          if(fMoves.length){
            const fBeam=Math.min(mw?16:38,fMoves.length);
            let bF=-Infinity;
            for(const fm of fMoves.slice(0,fBeam)){
              const af=wBoard.map(r=>[...r]);
              for(const[x,y]of fm.abs) af[y][x]={player:ap,pieceKey:fm.pk};
              const rem3={[ap]:wRem[ap].filter(k=>k!==fm.pk),[hp]:[...(wRem[hp]||[])]};
              const s3=quickScore(af,ap,hp,boardW,boardH)
                      +allPiecesViabilityScore(af,boardW,boardH,rem3[ap],placedCount+3,allowFlip,PENTOMINOES,transformCells);
              let worstPly4=0;
              if(checkOppViab){
                const h2Moves=movesOnBoard(hp,af,boardW,boardH,rem3,placedCount+3,allowFlip);
                for(const hm of h2Moves.slice(0,10)){
                  const ah=af.map(r=>[...r]);
                  for(const[x,y]of hm.abs) ah[y][x]={player:hp,pieceKey:hm.pk};
                  const v4=allPiecesViabilityScore(ah,boardW,boardH,rem3[ap],placedCount+4,allowFlip,PENTOMINOES,transformCells);
                  if(v4<worstPly4) worstPly4=v4;
                }
              }
              const sTot=s3+worstPly4*0.7;
              if(sTot>bF) bF=sTot;
            }
            lookahead=(bF+wS)*0.5;
          } else lookahead=wS;
        }
      }

      let iLanePenalty=0;
      if(hpHand.includes('I')){
        const lanesAfterMove=countReachableILanes(sim,boardW,boardH);
        const urgency=1.0;
        iLanePenalty=-(lanesAfterMove*150*urgency);
        if(rem[ap].some(p=>['L','N','Y','Z'].includes(p))){
          iLanePenalty-=(lanesAfterMove*200*urgency);
        }
      }

      const viabScore = allPiecesViabilityScore(sim,boardW,boardH,rem[ap],placedCount+1,allowFlip,PENTOMINOES,transformCells);
      const gradPenalty = placementCountGradientPenalty(rem[ap], placementCounts);
      const survivalPenalty = constrainedPieceSurvivalPenalty(sim, boardW, boardH, rem[ap], allowFlip, PENTOMINOES, transformCells);
      const xSpaceBonus = xSpacePreservationBonus(m.abs, board, sim, boardW, boardH, rem[ap], allowFlip, PENTOMINOES, transformCells);

      // FIX C: Proactive hard-piece bonus — reward playing tricky pieces NOW
      // proportional to how constrained their placement count already is.
      // This front-loads U/W/X/F while the board is still open.
      const HARD_URGENT = new Set(['X','U','W','F']);
      let hardPieceBonus = 0;
      if(HARD_URGENT.has(m.pk)){
        const myCount = placementCounts.get(m.pk) ?? 999;
        // Urgency scales inversely: fewer options → bigger bonus for playing it now
        if(myCount <= 3)       hardPieceBonus = 600;
        else if(myCount <= 6)  hardPieceBonus = 350;
        else if(myCount <= 10) hardPieceBonus = 150;
        else if(myCount <= 18) hardPieceBonus = 60;
        // Additional bonus: if we have multiple hard pieces, play the most constrained first
        const otherHardInHand = aiHand.filter(p => HARD_URGENT.has(p) && p !== m.pk);
        if(otherHardInHand.length > 0){
          const otherMin = Math.min(...otherHardInHand.map(p => placementCounts.get(p) ?? 999));
          if(myCount <= otherMin) hardPieceBonus *= 1.4; // we ARE the most urgent hard piece
        }
      }

      // ── V5.0 NEW TERMS ──────────────────────────────────────────────
      const parityDeadZone = boardParityDeadZoneScore(sim, boardW, boardH, ap, hp);
      const uniqueCavity   = uniqueCavityBankingScore(sim, boardW, boardH, ap, hp, rem[ap], rem[hp], PENTOMINOES, transformCells);
      const excFraming     = exclusiveCavityFramingBonus(m.abs, sim, boardW, boardH, ap, hp, rem[ap], rem[hp], PENTOMINOES, transformCells);
      const bbTrap         = antiBulkyBoundingBoxScore(sim, boardW, boardH, ap, hp, rem[ap], rem[hp], PENTOMINOES, transformCells);
      // ────────────────────────────────────────────────────────────────

      let score=
          tAdv*24+mobRed*28+feaRed*32+infB*2.5+sealB*3   // V6: mobRed weight doubled (28 vs 14), mobility > territory
         +frontCtrl*2.5+eff*2+lookahead*22-exposure*1.5
         +ownFea*30-oppFea*40                              // V6: mobility counts weighted up
         +openTerritoryBonus(m.abs,sim,boardW,boardH,ap,regs)*2
         +aiClusterPenalty(sim,boardW,boardH,ap)*2.5+blunder
         +apBonus*3+splitBonus*2.5+sealTerr*2+shapeRead*1.8
         +planBonus+oppBonus+disrupt
         +selfShapeRead*4.5                                         
         +cavityFramingBonus(m.abs,cavityPlan,sim,boardW,boardH,ap)*2.5
         +opponentCavityIntrusionBonus(m.abs,oppCavity,boardW)*5.0  
         +pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiPC)*3
         +sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*3.5
         +endgameParityScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)*3.0
         +iPieceUrgencyBonus(m.pk,placedCount,boardW,boardH)
         +iEdgePlacementBonus(m.pk,m.abs,boardW,boardH)*2.0
         +(hpHand.includes('I')?iLaneClosingBonus(m.abs,board,sim,boardW,boardH)*3.5:0)
         +iLanePenalty
         +pairTerrScore*2.5                                         
         +comboSetup*2.0
         +iLaneFence*1.2
         +excCavity*5.5                                             
         +antiExclusive*1.0                                         
         +forkCounter*5.0                                           
         +coopCavPenalty*6.0                                        
         +abandonedZone*4.0                                         
         +dualAnchorCounter*6.0                                     
         +cornerControlBonus(sim,boardW,boardH,ap,hp)*5.5
         +viabScore*25.0
         +gradPenalty*8.0
         +survivalPenalty*15.0    // V5.1 FIX: boosted from 4.0 → 15.0 to override denial logic
         +xSpaceBonus*3.0
         // ── V5.0 contributions ────────────────────────────────────
         +parityDeadZone*4.5   // dead-zone math favours AI
         +uniqueCavity*3.5     // exclusive piece-cavity banking
         +excFraming*3.0       // framing exclusive cavities
         +bbTrap*3.5           // anti-bulky bounding box traps
         +hardPieceBonus;      // FIX C: proactive hard-piece urgency

      if(aggMult>1){
        const aggSig=apBonus+splitBonus+mobRed*3+disrupt+oppBonus*0.5;
        score+=aggSig*(aggMult-1)*10;
      }

      if(score>bScore){bScore=score;best=m;}
      if(_topKList) _topKList.push({m,score}); 
    }
    if(_topKList){
      _topKList.sort((a,b)=>b.score-a.score);
      return _topKList.slice(0,_topKK).map(x=>x.m);
    }
    return best;
  }

  // ─────────────────────────────────────────────────────────────────
  //  V6.0 — DEEP ALPHA-BETA ENGINE (5-ply Expert / 7-ply Ultimate)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Recursive alpha-beta with:
   *  - Zobrist transposition table (instant hash lookups)
   *  - Killer heuristic: moves that caused beta-cutoffs tried first
   *  - Mobility-Reduction primary move ordering (Killer Heuristic spec)
   *  - Parity-Induced Pruning: regions where area%5≠0 or checkerboard
   *    parity is impossible get -Infinity score on the AI's branch
   *  - Domination Analysis: prune strictly dominated moves before search
   *  - Bitwise blob detection (bbBlobRegions) — no floodFill inside tree
   *  - Time-budgeted iterative deepening: exits gracefully on timeout
   *
   * @param {object[]} topMoves   Pre-filtered top-K candidates from movesLegendary
   * @returns {object|null}       Best move found within time budget
   */
  function deepAlphaBeta(topMoves) {
    if (!topMoves.length) return null;

    const { board, boardW: W, boardH: H, remaining, placedCount, allowFlip } = game;
    const ap = aiPlayer.value, hp = humanPlayer.value;
    const diff = aiDifficulty.value;

    // Depth: 5-ply Expert, 7-ply Ultimate
    const MAX_DEPTH  = diff === 'ultimate' ? 7 : 5;
    // Time budget: generous enough to reach target depth for most positions
    const BUDGET_MS  = diff === 'ultimate' ? 3500 : 2000;
    const DEADLINE   = Date.now() + BUDGET_MS;
    const flipOpts   = allowFlip ? [false, true] : [false];

    // Pre-build spread lookup for this board size (cached)
    const sl = buildSpreadLookup(W, H);

    // ── Transposition Table (Zobrist) ──────────────────────────────
    // Maps zobristHash|remAP|remHP  →  {depth, score, flag, move}
    // flag: 'exact' | 'lower' | 'upper'
    const TT   = new Map();
    const TT_MAX = 80000;
    function ttKey(b, remAP, remHP) {
      return boardZobristHash(b, W, H).toString(16) +
             '|' + remAP.slice().sort().join('') +
             '|' + remHP.slice().sort().join('');
    }

    // ── Killer Move Table ──────────────────────────────────────────
    // killers[depth] = [pk1, pk2] — piece keys that caused β-cutoffs
    const killers = Array.from({ length: MAX_DEPTH + 2 }, () => []);
    function updateKiller(depth, pk) {
      const k = killers[depth];
      if (k[0] === pk) return;
      k[1] = k[0]; k[0] = pk;
    }

    // ── Move Ordering ───────────────────────────────────────────────
    // Primary key: killer piece first; secondary: mobility reduction
    function orderMoves(rawMoves, b, rem, pc, depth, isAI) {
      if (rawMoves.length <= 1) return rawMoves;
      const kArr = killers[depth] || [];
      const before = _mobileCount(b, W, H, isAI ? hp : ap, rem, pc);

      const scored = rawMoves.map(m => {
        const sim = b.map(r => [...r]);
        for (const [x, y] of m.abs) sim[y][x] = { player: m._owner, pieceKey: m.pk };
        const after = _mobileCount(sim, W, H, isAI ? hp : ap, rem, pc + 1);
        const killerBonus = kArr.includes(m.pk) ? 100000 : 0;
        return { m, s: killerBonus + (before - after) };
      });
      scored.sort((a, b) => b.s - a.s);
      return scored.map(x => x.m);
    }

    // Approximate move count (count feasible pieces × avg placements)
    function _mobileCount(b, bW, bH, player, rem, pc) {
      const hand = rem[player] || [];
      let cnt = 0;
      for (const pk of hand) {
        const base = PENTOMINOES[pk];
        const seen = new Set();
        outer: for (const fl of flipOpts) for (let r = 0; r < 4; r++) {
          const shape = transformCells(base, r, fl);
          const k = shape.map(([x, y]) => `${x},${y}`).join('|');
          if (seen.has(k)) continue; seen.add(k);
          for (let ay = 0; ay < bH; ay++) for (let ax = 0; ax < bW; ax++) {
            let valid = true;
            for (const [dx, dy] of shape) {
              const x = ax + dx, y = ay + dy;
              if (x < 0 || y < 0 || x >= bW || y >= bH || b[y][x] !== null) { valid = false; break; }
            }
            if (!valid) continue;
            if (pc > 0) {
              let t = false;
              tO: for (const [dx, dy] of shape) {
                const x = ax + dx, y = ay + dy;
                for (const [ox, oy] of DIRS) {
                  const nx = x + ox, ny = y + oy;
                  if (nx >= 0 && ny >= 0 && nx < bW && ny < bH && b[ny][nx] !== null) { t = true; break tO; }
                }
              }
              if (!t) continue;
            }
            cnt++; continue outer;
          }
        }
      }
      return cnt;
    }

    // Sample moves for a player inside the search tree (most-constrained first)
    function sampleMovesAB(player, hand, b, pc, maxMoves) {
      if (!hand.length) return [];
      // Find piece with fewest valid placements
      let minCnt = Infinity, minPk = hand[0];
      for (const pk of hand) {
        let cnt = 0;
        const base = PENTOMINOES[pk];
        const seen = new Set();
        outerC: for (const fl of flipOpts) for (let r = 0; r < 4; r++) {
          const shape = transformCells(base, r, fl);
          const k = shape.map(([x, y]) => `${x},${y}`).join('|');
          if (seen.has(k)) continue; seen.add(k);
          for (let ay = 0; ay < H; ay++) for (let ax = 0; ax < W; ax++) {
            let valid = true;
            for (const [dx, dy] of shape) {
              const x = ax + dx, y = ay + dy;
              if (x < 0 || y < 0 || x >= W || y >= H || b[y][x] !== null) { valid = false; break; }
            }
            if (!valid) continue;
            cnt++; if (cnt >= 20) break outerC;
          }
        }
        if (cnt < minCnt) { minCnt = cnt; minPk = pk; }
      }
      if (minCnt === 0) return []; // stranded

      // Gather placements for minPk
      const moves = [];
      const base = PENTOMINOES[minPk];
      const seen = new Set();
      outerP: for (const fl of flipOpts) for (let r = 0; r < 4; r++) {
        const shape = transformCells(base, r, fl);
        const k = shape.map(([x, y]) => `${x},${y}`).join('|');
        if (seen.has(k)) continue; seen.add(k);
        for (let ay = 0; ay < H; ay++) for (let ax = 0; ax < W; ax++) {
          let valid = true; const abs = [];
          for (const [dx, dy] of shape) {
            const x = ax + dx, y = ay + dy;
            if (x < 0 || y < 0 || x >= W || y >= H || b[y][x] !== null) { valid = false; break; }
            abs.push([x, y]);
          }
          if (!valid) continue;
          if (pc > 0) {
            let t = false;
            tOm: for (const [x, y] of abs) for (const [ox, oy] of DIRS) {
              const nx = x + ox, ny = y + oy;
              if (nx >= 0 && ny >= 0 && nx < W && ny < H && b[ny][nx] !== null) { t = true; break tOm; }
            }
            if (!t) continue;
          }
          moves.push({ pk: minPk, abs, _owner: player });
          if (moves.length >= maxMoves) break outerP;
        }
      }
      return moves;
    }

    // ── Leaf Evaluation ────────────────────────────────────────────
    //
    // V5.1: Added _fastLeafSurvival (bounding-box approximation, no rotation loop).
    // V5.2: Three additional improvements:
    //
    //  FIX 3 (BB Trap Detection in AB):
    //    If AI holds only bulky pieces and a compact 3×2/2×3 pocket exists, apply
    //    a heavy penalty. This catches the self-trapping the 7-ply horizon misses.
    //
    //  FIX 4 (Phase Transition — Voronoi fade):
    //    On a 10×6 board the territory metric is meaningful only in the opening.
    //    After 4 placements the board often fragments; Voronoi becomes misleading.
    //    Blend it out smoothly: full weight at pc=0, zero at pc≥6.
    //
    //  FIX 5 (I-Piece Defense):
    //    If the opponent still holds I, every reachable 5-in-a-row gap is a live
    //    threat. Penalise open I-lanes directly in the leaf so the search actively
    //    works to close them. Scaled to -220/lane (less aggressive than user's -500
    //    to avoid overcorrecting mid-game when lanes naturally exist).

    const _LEAF_MIN_SPAN = { I:5, L:4, N:4, Y:4, T:3, Z:3, F:3, U:3, W:3, X:3, V:3, P:2 };
    const _LEAF_BASE_PEN = { X:200, I:200, W:160, F:160, U:130, N:120, L:120, Y:120, Z:100, T:100, P:80, V:80 };

    // FIX B: Shape-aware survival — U/W/X/F have irregular shapes that bbox cannot verify.
    // We store actual region cells for these pieces so pieceCanFitInRegion can be called.
    function _fastLeafSurvival(b, remAP) {
      if (!remAP.length) return 0;
      const regions = floodFillRegions(b, W, H);
      const viable = [];
      const viableRegCells = []; // store actual cells for shape-aware checks
      for (const reg of regions) {
        if (reg.length < 5) continue;
        let minX = W, maxX = 0, minY = H, maxY = 0;
        for (const [x, y] of reg) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        viable.push({ size: reg.length, bw: maxX - minX + 1, bh: maxY - minY + 1 });
        viableRegCells.push(reg);
      }

      if (!viable.length) return remAP.length * -300;

      // FIX B: Pieces whose shapes cannot be verified by bbox alone
      const NEEDS_SHAPE_CHECK = new Set(['U', 'W', 'X', 'F']);
      const flipOpts = allowFlip ? [false, true] : [false];

      let penalty = 0;
      for (const pk of remAP) {
        const minSpan = _LEAF_MIN_SPAN[pk] || 3;
        let canFit = false;
        if (NEEDS_SHAPE_CHECK.has(pk)) {
          // Use actual region geometry for irregular pieces
          for (const reg of viableRegCells) {
            if (pieceCanFitInRegion(pk, reg, flipOpts, PENTOMINOES, transformCells)) {
              canFit = true; break;
            }
          }
        } else {
          canFit = viable.some(r => r.bw >= minSpan || r.bh >= minSpan);
        }
        if (!canFit) penalty -= (_LEAF_BASE_PEN[pk] || 100);
      }
      return penalty;
    }

    function leafEval(b, remAP, remHP, pc) {
      const aiMob = _mobileCount(b, W, H, ap, { [ap]: remAP, [hp]: remHP }, pc);
      const hpMob = _mobileCount(b, W, H, hp, { [ap]: remAP, [hp]: remHP }, pc);
      const parity = bbParityScore(b, W, H, sl);
      const aiSurvival = _fastLeafSurvival(b, remAP);

      // FIX 4: Voronoi territory fades out as board fragments (pc = pieces placed so far)
      // Full weight [0..3 placements], linear fade [4..5], zero [6+]
      const terrWeight = pc <= 3 ? 8 : pc <= 5 ? 8 * (1 - (pc - 3) / 3) : 0;
      const terrAdv = terrWeight > 0 ? territoryAdvantage(b, W, H, ap, hp) : 0;

      // FIX 5: I-piece defense — penalise every reachable 5-in-a-row lane
      let iLanePenalty = 0;
      if (remHP.includes('I')) {
        const openLanes = countReachableILanes(b, W, H);
        // -220 per open lane: meaningful deterrent without locking the AI into
        // I-blocking at the expense of its own placement quality
        iLanePenalty = openLanes * -220;
      }

      // FIX 3: BB trap detection — if AI has bulky pieces but no compact filler,
      // penalise any tight 3×2/2×3 pocket it just created
      let bbTrapPenalty = 0;
      const aiHasBulkyLeaf = remAP.some(p => ['I','L','N','Y','T','Z'].includes(p));
      const aiHasCompactLeaf = remAP.some(p => ['P','U'].includes(p));
      if (aiHasBulkyLeaf && !aiHasCompactLeaf) {
        const regs = floodFillRegions(b, W, H);
        for (const reg of regs) {
          if (reg.length < 5 || reg.length > 7) continue;
          let minX = W, maxX = -1, minY = H, maxY = -1;
          for (const [x, y] of reg) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
          const bw = maxX - minX + 1, bh = maxY - minY + 1;
          if ((bw <= 3 && bh <= 2) || (bw <= 2 && bh <= 3)) bbTrapPenalty -= 500;
        }
      }

      return (aiMob - hpMob) * 18
           + terrAdv * terrWeight
           + parity * 2
           + aiSurvival * 8.0
           + iLanePenalty
           + bbTrapPenalty;
    }

    // ── Parity-Induced Pruning check ───────────────────────────────
    function parityPruningScore(b) {
      const blobs = bbBlobRegions(b, W, H, sl);
      let penalty = 0;
      for (const { size, black, white } of blobs) {
        const diff = Math.abs(black - white);
        if (size % 5 !== 0) { penalty += 999; }
        else {
          const k = (size / 5) | 0;
          if (diff > k || (diff % 2) !== (k % 2)) penalty += 500;
        }
      }
      return penalty;
    }

    // ── Domination Analysis ────────────────────────────────────────
    // Before the search proper, discard moves where another move is
    // strictly better in BOTH territory AND mobility reduction.
    function removeDominatedMoves(candidates) {
      if (candidates.length <= 2) return candidates;
      const assessed = candidates.map(m => {
        const sim = board.map(r => [...r]);
        for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
        const remAP = remaining[ap].filter(k => k !== m.pk);
        const remHP = remaining[hp] || [];
        const terr = territoryAdvantage(sim, W, H, ap, hp);
        const aiMob = _mobileCount(sim, W, H, ap, { [ap]: remAP, [hp]: remHP }, placedCount + 1);
        const hpMobBefore = _mobileCount(board, W, H, hp, remaining, placedCount);
        const hpMobAfter  = _mobileCount(sim,  W, H, hp, { [ap]: remAP, [hp]: remHP }, placedCount + 1);
        const mobRed = hpMobBefore - hpMobAfter;
        return { m, terr, aiMob, mobRed };
      });
      return assessed.filter(a => {
        // Keep m unless there exists another move b where
        //   b.terr >= a.terr AND b.mobRed >= a.mobRed AND b.aiMob >= a.aiMob
        //   AND at least one is strictly greater
        for (const b of assessed) {
          if (b === a) continue;
          if (b.terr >= a.terr && b.mobRed >= a.mobRed && b.aiMob >= a.aiMob &&
              (b.terr > a.terr || b.mobRed > a.mobRed || b.aiMob > a.aiMob)) {
            return false; // a is dominated by b
          }
        }
        return true;
      }).map(a => a.m);
    }

    // ── Core Alpha-Beta ────────────────────────────────────────────
    function ab(b, remAP, remHP, depth, alpha, beta, isAI, pc) {
      if (Date.now() > DEADLINE) return { score: isAI ? alpha : beta, timed: true };

      const key = ttKey(b, remAP, remHP);
      const tte = TT.get(key);
      if (tte && tte.depth >= depth) {
        if (tte.flag === 'exact')                      return { score: tte.score, move: tte.move };
        if (tte.flag === 'lower' && tte.score >= beta) return { score: tte.score, move: tte.move };
        if (tte.flag === 'upper' && tte.score <= alpha)return { score: tte.score, move: tte.move };
      }

      const hand   = isAI ? remAP : remHP;
      const player = isAI ? ap    : hp;

      if (!hand.length || depth === 0) {
        const s = leafEval(b, remAP, remHP, pc);
        if (TT.size < TT_MAX) TT.set(key, { depth: 0, score: s, flag: 'exact', move: null });
        return { score: s, move: null };
      }

      // Sample most-constrained piece moves for this ply
      const PLY_SAMPLE = depth >= 4 ? 5 : depth >= 2 ? 8 : 12;
      let rawMoves = sampleMovesAB(player, hand, b, pc, PLY_SAMPLE * 3);
      if (!rawMoves.length) {
        const s = isAI ? -4000 : 4000;
        return { score: s, move: null };
      }

      // Order by killer heuristic + mobility reduction
      const ordered = orderMoves(rawMoves, b, { [ap]: remAP, [hp]: remHP }, pc, depth, isAI);
      const capped  = ordered.slice(0, PLY_SAMPLE);

      let bestScore = isAI ? -Infinity : Infinity;
      let bestMove  = capped[0];
      let flag = isAI ? 'upper' : 'lower';

      for (const m of capped) {
        if (Date.now() > DEADLINE) return { score: bestScore, timed: true, move: bestMove };

        const sim = b.map(r => [...r]);
        for (const [x, y] of m.abs) sim[y][x] = { player, pieceKey: m.pk };
        const newRemAP = isAI ? remAP.filter(k => k !== m.pk) : [...remAP];
        const newRemHP = isAI ? [...remHP] : remHP.filter(k => k !== m.pk);

        // ── Parity-Induced Pruning ──────────────────────────────
        // If this move creates provably impossible regions, prune aggressively.
        // Only apply from depth >= 3 to avoid over-pruning near leaves.
        if (depth >= 3) {
          const pp = parityPruningScore(sim);
          if (isAI && pp > 1500) {
            // Move creates massive parity debt — prune unless last candidate
            if (capped.length > 1) continue;
          }
        }

        const result = ab(sim, newRemAP, newRemHP, depth - 1, alpha, beta, !isAI, pc + 1);
        if (result.timed) return { score: bestScore, timed: true, move: bestMove };

        if (isAI) {
          if (result.score > bestScore) { bestScore = result.score; bestMove = m; }
          if (bestScore > alpha) { alpha = bestScore; flag = 'exact'; }
          if (alpha >= beta) {
            updateKiller(depth, m.pk);
            if (TT.size < TT_MAX) TT.set(key, { depth, score: bestScore, flag: 'lower', move: m });
            return { score: bestScore, move: bestMove };
          }
        } else {
          if (result.score < bestScore) { bestScore = result.score; bestMove = m; }
          if (bestScore < beta) { beta = bestScore; flag = 'exact'; }
          if (beta <= alpha) {
            if (TT.size < TT_MAX) TT.set(key, { depth, score: bestScore, flag: 'upper', move: m });
            return { score: bestScore, move: bestMove };
          }
        }
      }

      if (TT.size < TT_MAX) TT.set(key, { depth, score: bestScore, flag, move: bestMove });
      return { score: bestScore, move: bestMove };
    }

    // ── Domination filter on entry ─────────────────────────────────
    const filtered = removeDominatedMoves(topMoves);
    const candidates = filtered.length ? filtered : topMoves;

    // ── Iterative deepening: 2-ply up to MAX_DEPTH ─────────────────
    let bestFinalMove = candidates[0];
    for (let d = 2; d <= MAX_DEPTH; d += 1) {
      if (Date.now() > DEADLINE) break;
      const result = ab(
        board,
        (remaining[ap] || []).slice(),
        (remaining[hp] || []).slice(),
        d, -Infinity, Infinity, true, placedCount
      );
      if (result.timed) break;
      // Map back to a concrete move from topMoves (ab returns minimax best
      // which may be a sub-move; find closest match in topMoves by pk)
      if (result.move) {
        const match = topMoves.find(m =>
          m.pk === result.move.pk &&
          m.abs.length === result.move.abs.length &&
          m.abs.every(([x, y], i) => result.move.abs[i][0] === x && result.move.abs[i][1] === y)
        );
        if (match) bestFinalMove = match;
        // If no exact match, keep using topMoves[0] from scoring
      }
    }

    return bestFinalMove;
  }

  function movesGod(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const aiPC=(remaining[ap]||[]).length,hpPC=(remaining[hp]||[]).length;
    if(aiPC<=3||hpPC<=3) return endgameSolve(moves);

    const diff=aiDifficulty.value;

    // FIX C: Proactive Hard-Piece Urgency
    // Before beam selection, check if any TRICKY pieces have very few placements.
    // If so, bias the candidate set toward those pieces NOW while board is open.
    const HARD_PIECES_URGENT = new Set(['X','U','W','F']);
    const aiHandGod = remaining[ap] || [];
    const hardInHand = aiHandGod.filter(p => HARD_PIECES_URGENT.has(p));
    if(hardInHand.length > 0){
      const flipOptsGod = allowFlip ? [false, true] : [false];
      let mostUrgentPk = null, lowestCnt = Infinity;
      for(const pk of hardInHand){
        let cnt = 0;
        const base = PENTOMINOES[pk]; const seen = new Set();
        outerGod: for(const flip of flipOptsGod) for(let rot = 0; rot < 4; rot++){
          const shape = transformCells(base, rot, flip);
          const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
          if(seen.has(oKey)) continue; seen.add(oKey);
          for(let ay = 0; ay < boardH; ay++) for(let ax = 0; ax < boardW; ax++){
            let valid = true;
            for(const [dx,dy] of shape){
              const x=ax+dx, y=ay+dy;
              if(x<0||y<0||x>=boardW||y>=boardH||board[y][x]!==null){valid=false;break;}
            }
            if(!valid) continue;
            cnt++; if(cnt >= 6) break outerGod; // cap at 6 — "safe" threshold
          }
        }
        // If a hard piece has ≤5 placements, it's getting dangerous
        if(cnt < lowestCnt){ lowestCnt = cnt; mostUrgentPk = pk; }
      }
      // Force play of the most constrained hard piece if it has ≤5 options
      if(mostUrgentPk && lowestCnt <= 5){
        const hardMoves = moves.filter(m => m.pk === mostUrgentPk);
        if(hardMoves.length > 0){
          // Use legendary scoring within this filtered set to find the best placement
          const savedMoves = [...moves];
          const topHard = movesLegendary(hardMoves, Math.min(3, hardMoves.length));
          if(topHard && topHard.length > 0){
            const candidate = Array.isArray(topHard) ? topHard[0] : topHard;
            // Double-check this move doesn't strand other pieces
            const simHard = board.map(r=>[...r]);
            for(const[x,y]of candidate.abs) simHard[y][x]={player:ap,pieceKey:candidate.pk};
            const remHard = aiHandGod.filter(k=>k!==candidate.pk);
            const viabHard = allPiecesViabilityScore(simHard,boardW,boardH,remHard,placedCount+1,allowFlip,PENTOMINOES,transformCells);
            if(viabHard >= -400) return candidate;
          }
        }
      }
    }

    // ── V6.0: Get top-K candidates from Legendary heuristic evaluator ──
    // K=8 for Ultimate (more alpha-beta candidates), K=5 for Expert
    const earlyPlacement = placedCount <= 2;
    const K = earlyPlacement
      ? Math.min(3, moves.length)
      : diff === 'ultimate' ? Math.min(8, moves.length) : Math.min(5, moves.length);
    const topK=movesLegendary(moves,K);
    if(!topK||!topK.length) return movesLegendary(moves);
    if(topK.length===1) return topK[0];

    // ── V6.0: Deep Alpha-Beta — Expert 5-ply, Ultimate 7-ply ──────────
    // Skip on very early placements where board is nearly empty (too many moves)
    let bestAB = null;
    if (!earlyPlacement) {
      bestAB = deepAlphaBeta(topK);
    }

    // ── Safety net: viability check on the chosen move ────────────────
    let bestMove = bestAB || topK[0];

    const simCheck=board.map(r=>[...r]);
    for(const[x,y]of bestMove.abs) simCheck[y][x]={player:ap,pieceKey:bestMove.pk};
    const remCheck=(remaining[ap]||[]).filter(k=>k!==bestMove.pk);
    const viab=allPiecesViabilityScore(simCheck,boardW,boardH,remCheck,placedCount+1,allowFlip,PENTOMINOES,transformCells);

    if(viab<-400){
      // Chosen move leaves AI in trouble — fall back to safest move in topK
      let safeBest=null,safeScore=-Infinity;
      for(const m of topK){
        const sim2=board.map(r=>[...r]);
        for(const[x,y]of m.abs) sim2[y][x]={player:ap,pieceKey:m.pk};
        const rem2=(remaining[ap]||[]).filter(k=>k!==m.pk);
        const v2=allPiecesViabilityScore(sim2,boardW,boardH,rem2,placedCount+1,allowFlip,PENTOMINOES,transformCells);
        if(v2<-400) continue;
        const s2=quickScore(sim2,ap,hp,boardW,boardH)+v2*0.5;
        if(s2>safeScore){safeScore=s2;safeBest=m;}
      }
      if(safeBest) bestMove=safeBest;
      if(!safeBest){
        // All topK moves are dangerous — play the urgent piece
        const allMoves=getAllValidMoves();
        const pcMap=computePiecePlacementCounts(
          remaining[ap]||[],board,boardW,boardH,placedCount,allowFlip,PENTOMINOES,transformCells
        );
        const minCnt=Math.min(...[...(remaining[ap]||[])].map(pk=>pcMap.get(pk)??999));
        const urgentPk=[...(remaining[ap]||[])].find(pk=>(pcMap.get(pk)??999)===minCnt);
        if(urgentPk){
          const urgentMoves=allMoves.filter(m=>m.pk===urgentPk);
          if(urgentMoves.length) bestMove=urgentMoves[0|Math.random()*urgentMoves.length];
        }
      }
    }

    return bestMove||topK[0];
  }

  function getSynergyTargets(picks,pool){
    const out=new Set();
    for(const k of picks) for(const p of(SYNERGY_PAIRS[k]||[])) if(pool.includes(p)) out.add(p);
    return[...out];
  }

  function gmDraftScore(k,aiPicks){
    let s=(SHAPE_SCORE[k]||2)*2;
    if(!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p))&&PIECE_ROLES.FLEXIBLE.has(k)) s+=4;
    if(!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))&&PIECE_ROLES.LINEAR.has(k))     s+=5;
    if(!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))&&PIECE_ROLES.FILLER.has(k))     s+=3;
    const bl=aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
    if(bl>=2&&PIECE_ROLES.BLOCKER.has(k)) s-=6;
    if(PIECE_ROLES.BLOCKER.has(k)&&aiPicks.length<3) s-=3;
    return s;
  }

  function legendarySmallPool(pool,aiPicks,hpPicks){
    if(pool.length>4) return null;
    const ELONGATED_LEG=['I','L','N','Y','Z'];
    const elongatedInHand=aiPicks.filter(p=>ELONGATED_LEG.includes(p)).length;
    const COMPACT_LEG=['F','W','V','U','X'];
    const compactInHand=aiPicks.filter(p=>COMPACT_LEG.includes(p)).length;
    const humanHasILeg=hpPicks.includes('I');
    const eligible=pool.filter(k=>{
      if(ELONGATED_LEG.includes(k)&&elongatedInHand>=2){
        const nonElong=pool.filter(p=>!ELONGATED_LEG.includes(p));
        return nonElong.length===0;
      }
      if(COMPACT_LEG.includes(k)&&compactInHand>=2&&!humanHasILeg){
        const nonComp=pool.filter(p=>!COMPACT_LEG.includes(p));
        return nonComp.length===0;
      }
      return true;
    });
    const candidates=eligible.length?eligible:pool; 
    let bestPick=null,bScore=-Infinity;
    for(const pick of candidates){
      const hGets=pool.filter(k=>k!==pick);
      const hScore=[...hpPicks,...hGets].reduce((s,k)=>s+(SHAPE_SCORE[k]||2)-(PIECE_ROLES.BLOCKER.has(k)?1.5:0),0);
      const score=(SHAPE_SCORE[pick]||2)-hScore*0.8;
      if(score>bScore){bScore=score;bestPick=pick;}
    }
    return bestPick;
  }

  function pickDraftPiece(){
    const pool=[...game.pool]; if(!pool.length) return null;
    const diff=aiDifficulty.value;
    const hp=humanPlayer.value,ap=aiPlayer.value;
    const hpPicks=game.picks[hp]||[],aiPicks=game.picks[ap]||[];

    // ── V6.0: DENIAL OVERRIDE — "Only Fit" Logic ─────────────────────
    // If any piece in the pool is the ONLY piece that can fit in a board
    // opening adjacent to the opponent, draft it regardless of SHAPE_SCORE.
    // This prevents the human from claiming a cavity that only one piece fills.
    if ((diff === 'ultimate' || diff === 'expert' || diff === 'legendary') &&
        game.board && game.boardW && game.boardH) {
      const { board, boardW, boardH, allowFlip } = game;
      const flipOpts = allowFlip ? [false, true] : [false];
      const regions = floodFillRegions(board, boardW, boardH);

      for (const reg of regions) {
        if (reg.length < 5 || reg.length > 10) continue;
        // Only consider regions adjacent to human territory
        let adjHp = false;
        for (const [x, y] of reg) {
          for (const [ox, oy] of DIRS) {
            const nx = x + ox, ny = y + oy;
            if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH &&
                board[ny][nx]?.player === hp) { adjHp = true; break; }
          }
          if (adjHp) break;
        }
        if (!adjHp) continue;

        // Find pieces in the pool that fit
        const fitting = pool.filter(pk =>
          pieceCanFitInRegion(pk, reg, flipOpts, PENTOMINOES, transformCells)
        );
        if (fitting.length === 1) {
          // This piece is the ONLY one that fits — must draft it for denial
          return fitting[0];
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────

    const nextIdx      = hpPicks.length + aiPicks.length; 
    const cyclePos     = nextIdx % 4;
    const openerIsAI   = (game._draftOpener ?? 1) === ap;
    const humanPicksNext = (openerIsAI && cyclePos === 0) || (!openerIsAI && cyclePos === 2) ? 2 : 0;
    const denialMult   = humanPicksNext === 2 ? 1.5 : 1.0;
    const greedMult    = humanPicksNext === 0 ? 1.3 : 1.0;

    let iUtilityModifier = 1.0;
    if (aiPicks.includes('I')) {
      const humanCompactCount = hpPicks.filter(p => ['F', 'W', 'X', 'U'].includes(p)).length;
      if (humanCompactCount >= 3) iUtilityModifier = 0.2; 
    }

    if(diff==='easy') return pool[Math.floor(Math.random()*pool.length)];

    if(diff==='normal'){
      if(Math.random() < (humanPicksNext===2 ? 0.25 : 0.5))
        return pool[Math.floor(Math.random()*pool.length)];
      const good=pool.filter(k=>VERSATILE_PIECES.has(k));
      return good.length?good[Math.floor(Math.random()*good.length)]:pool[Math.floor(Math.random()*pool.length)];
    }

    if(diff==='hard'){
      const targets=getSynergyTargets(hpPicks,pool);
      const denyChance = Math.min(0.97, 0.85 * denialMult);
      if(targets.length&&Math.random()<denyChance) return targets[Math.floor(Math.random()*targets.length)];
      const good=pool.filter(k=>VERSATILE_PIECES.has(k));
      const versatileChance = Math.min(0.96, 0.80 * greedMult);
      if(good.length&&Math.random()<versatileChance) return good[Math.floor(Math.random()*good.length)];
      const tricky=pool.filter(k=>TRICKY_PIECES.has(k));
      if(tricky.length&&humanPicksNext===0&&Math.random()<0.65) return tricky[Math.floor(Math.random()*tricky.length)];
      return pool[Math.floor(Math.random()*pool.length)];
    }

    if(diff==='master'){
      function gmSnakeScore(k){
        let s = gmDraftScore(k,aiPicks) * greedMult;
        if(getSynergyTargets(hpPicks,[k]).length) s += 8 * denialMult;
        const poolAfter=pool.filter(p=>p!==k);
        const synBefore=getSynergyTargets(hpPicks,pool).length;
        const synAfter =getSynergyTargets(hpPicks,poolAfter).length;
        s += (synBefore - synAfter) * 5 * denialMult;
        return s;
      }
      const targets=getSynergyTargets(hpPicks,pool);
      if(targets.length && (humanPicksNext===2 || Math.random()<0.9))
        return targets.reduce((b,k)=>gmSnakeScore(k)>gmSnakeScore(b)?k:b,targets[0]);
      const rectFriendly=pool.filter(k=>['I','L','Y','P','N','T','V'].includes(k));
      if(rectFriendly.length&&Math.random()<(0.7*greedMult))
        return rectFriendly.reduce((b,k)=>gmSnakeScore(k)>gmSnakeScore(b)?k:b,rectFriendly[0]);
      return pool.reduce((b,k)=>gmSnakeScore(k)>gmSnakeScore(b)?k:b);
    }

    const sp=legendarySmallPool(pool,aiPicks,hpPicks); if(sp) return sp;

    if(diff==='ultimate'){
      const ELONG_G=['I','L','N','Y']; 
      const COMP_G=['F','W','V','U','X'];
      const elongInHand_G=aiPicks.filter(p=>ELONG_G.includes(p)).length;
      const compInHand_G=aiPicks.filter(p=>COMP_G.includes(p)).length;
      const humanHasI_G=hpPicks.includes('I');
      const humanCompact_G=hpPicks.filter(p=>COMP_G.includes(p)).length;
      const poolHasI_G=pool.includes('I');
      const poolCompact_G=pool.filter(p=>COMP_G.includes(p)).length;
      const proactiveCap=(elongInHand_G>=1&&poolHasI_G&&poolCompact_G>=2)?1:2;
      const reactiveCap=(humanHasI_G&&humanCompact_G>=1)?1:2;
      const elongCapG=Math.min(proactiveCap,reactiveCap);

      const dh_g=_getDraftHistory();
      const freq_g={};
      for(const e of dh_g) for(const pk of(e.humanPicks||[])) freq_g[pk]=(freq_g[pk]||0)+1;
      const maxF_g=Math.max(1,...Object.values(freq_g));
      const hw_g=Math.min(1,dh_g.length/5);
      const hTargets_g=getSynergyTargets(hpPicks,pool).length;

      function evalHand(aiH,hpH){
        const aiQ=aiH.reduce((s,p)=>s+(SHAPE_SCORE[p]||2),0);
        const hpQ=hpH.reduce((s,p)=>s+(SHAPE_SCORE[p]||2),0);
        let score=aiQ-hpQ;
        const aiEl=aiH.filter(p=>ELONG_G.includes(p)).length;
        const hpHasI2=hpH.includes('I');
        const hpComp2=hpH.filter(p=>COMP_G.includes(p)).length;
        if(hpHasI2||hpComp2>=2) score-=aiEl*12;
        if(aiEl>=2&&(hpHasI2||hpComp2>=2)) score-=22;
        if(hpHasI2) score-=16;
        for(const pk of aiH) for(const sp of(SYNERGY_PAIRS[pk]||[])) if(aiH.includes(sp)) score+=4;
        const AI_CORNER_ANCHOR=['U','V','W'];
        const AI_FLEX_FILLER=['Z','N','P'];
        const aiHasAnchor=aiH.some(p=>AI_CORNER_ANCHOR.includes(p));
        const aiHasFiller=aiH.some(p=>AI_FLEX_FILLER.includes(p));
        if(aiHasAnchor&&aiHasFiller) score+=9;
        const hpHasAnchor=hpH.some(p=>AI_CORNER_ANCHOR.includes(p));
        const hpHasFiller=hpH.some(p=>AI_FLEX_FILLER.includes(p));
        if(hpHasAnchor&&hpHasFiller) score-=11;
        return score;
      }

      function godDraftScore(pick){
        let s=(SHAPE_SCORE[pick]||2)*4*greedMult;

        // FIX F: Hard BLOCKER cap — drafting 2+ BLOCKER/UNPAIRABLE pieces in
        // the same hand is a proven failure mode (Game 1: U+X+W; Game 2: X+F).
        // Apply escalating penalties to discourage stacking these irregular shapes.
        const blockerInHand = aiPicks.filter(p => PIECE_ROLES.BLOCKER.has(p)).length;
        if(PIECE_ROLES.BLOCKER.has(pick)){
          if(blockerInHand >= 1) s -= 20 * greedMult; // strong penalty for 2nd blocker
          if(blockerInHand >= 2) s -= 45 * greedMult; // near-disqualification for 3rd
        }

        // ── V5.2 FIX: TRICKY-RIGID CAP — cap only genuinely self-trapping pieces ─
        // F and N require unusual open shapes and tangle themselves in tight boards.
        // X and W are DENIAL pieces with high board presence — do NOT cap them.
        // Drafting X/W is often the correct move precisely to deny the human.
        const TRICKY_RIGID = ['F', 'N']; // X and W deliberately excluded
        const trickyInHand = aiPicks.filter(p => TRICKY_RIGID.includes(p)).length;
        if (TRICKY_RIGID.includes(pick) && trickyInHand >= 1) {
          s -= 22 * greedMult; // softer than before — still discourages F+N stacking
        }
        if (['P', 'V', 'U'].includes(pick) && trickyInHand >= 1) {
          s += 30 * greedMult; // glue pieces support the tricky one
        }
        // ─────────────────────────────────────────────────────────────────────────

        // ── V5.0: ANTI-BULKY DRAFTING (enhanced) ──────────────────────
        const compactInHand  = aiPicks.filter(p => PIECE_ROLES.COMPACT.has(p)).length;
        const humanBulky_G   = hpPicks.filter(p => BULKY_PIECES.has(p)).length;
        const humanCompact   = hpPicks.filter(p => COMPACT_PIECES.has(p) || p === 'X' || p === 'F').length;

        // If human is drafting bulky pieces, aggressively grab compact pieces
        if (humanBulky_G >= 1 && COMPACT_PIECES.has(pick)) {
          s += humanBulky_G * 28 * denialMult;   // Each human bulky = +28 per compact pick
        }
        if (humanBulky_G >= 2 && COMPACT_PIECES.has(pick) && compactInHand === 0) {
          s += 55 * greedMult;  // Emergency: must have at least one compact
        }

        // Anti-hoarding counter: if human is stockpiling compact pieces, steal them
        if (humanCompact >= 2 && ['P','U','F','X'].includes(pick)) {
          s += 35 * denialMult;
        }

        // Forced anchor prioritization: compact pieces are essential endgame tools
        if (['P','U'].includes(pick) && compactInHand === 0) {
          s += 40 * greedMult;
        }

        // Prevent Bulky stacking if we lack an anchor and compact is still available
        if (PIECE_ROLES.BULKY.has(pick) && compactInHand === 0 && (pool.includes('P') || pool.includes('U'))) {
          s -= 22;   // Stronger penalty in v5.0
        }

        // If AI already has 2+ compact pieces, reward more bulky variety instead
        if (COMPACT_PIECES.has(pick) && compactInHand >= 2 && !humanHasI_G) {
          s -= 15;   // Diminishing returns on compact hoarding
        }
        // ──────────────────────────────────────────────────────────────

        if (pick === 'I') s *= iUtilityModifier;
        for(const hk of hpPicks) if((SYNERGY_PAIRS[hk]||[]).includes(pick)) s+=16*denialMult;
        const poolAP=pool.filter(k=>k!==pick);
        s+=(hTargets_g-getSynergyTargets(hpPicks,poolAP).length)*6*denialMult;
        s+=((freq_g[pick]||0)/maxF_g)*20*hw_g*denialMult;
        if(!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p))&&PIECE_ROLES.FLEXIBLE.has(pick)) s+=7*greedMult;
        if(!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))&&PIECE_ROLES.LINEAR.has(pick)) s+=9*greedMult;
        if(!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))&&PIECE_ROLES.FILLER.has(pick)) s+=5*greedMult;
        if(humanHasI_G){
          if(['F','X','W','U'].includes(pick)) s+=22*denialMult;
          if(['T','X'].includes(pick)) s+=12*greedMult;
        }
        if(COMP_G.includes(pick)&&humanCompact_G>=2) s+=22*denialMult;
        const hcLocal=hpPicks.filter(p=>COMP_G.includes(p)).length;
        if(pick==='I') s-=hcLocal*7;
        if(['I','L','Y','P','N'].includes(pick)) s+=5;
        if(VERSATILE_PIECES.has(pick)) s+=4;
        if(UNPAIRABLE.has(pick)) s-=6;

        const aiHasP=aiPicks.includes('P'), aiHasU=aiPicks.includes('U');
        const hpHasP=hpPicks.includes('P'), hpHasU=hpPicks.includes('U');
        if(pick==='U'&&aiHasP&&pool.includes('U')) s+=50*greedMult; 
        if(pick==='P'&&aiHasU&&pool.includes('P')) s+=50*greedMult;
        if(pick==='U'&&hpHasP&&pool.includes('U')) s+=45*denialMult; 
        if(pick==='P'&&hpHasU&&pool.includes('P')) s+=45*denialMult;
        if(!aiHasP&&!aiHasU&&!hpHasP&&!hpHasU&&(pick==='P'||pick==='U')) s+=10*greedMult;
        if((pick==='P'||pick==='U')&&!hpPicks.includes(pick==='P'?'U':'P')) s+=14*greedMult;

        const hpHasX_G = hpPicks.includes('X');
        if (hpHasX_G) {
          if (['T', 'N', 'Z', 'P'].includes(pick)) s += 18 * greedMult; 
        }
        if (pick === 'X' && !hpHasX_G) s += 30 * denialMult; 

        if ((SHAPE_SCORE[pick] || 2) <= 2 && aiPicks.length >= 1) {
          const highUtilInPool = godPool.filter(p => (SHAPE_SCORE[p] || 2) >= 4).length;
          if (highUtilInPool > 0) s *= 0.55; 
        }
        const projAI=[...aiPicks,pick];
        const poolAfterMe=pool.filter(k=>k!==pick);
        let worstOutcome=0;
        if(poolAfterMe.length>0){
          let worstDelta=Infinity;
          for(const hpick of poolAfterMe){
            const projHP=[...hpPicks,hpick];
            const delta=evalHand(projAI,projHP); 
            if(delta<worstDelta){worstDelta=delta;worstOutcome=delta;}
          }
          s+=worstOutcome*0.45; 
        }
        return s;
      }

      const godElig=pool.filter(k=>{
        if(ELONG_G.includes(k)&&elongInHand_G>=elongCapG)
          return pool.filter(p=>!ELONG_G.includes(p)).length===0;
        if(COMP_G.includes(k)&&compInHand_G>=2&&!humanHasI_G)
          return pool.filter(p=>!COMP_G.includes(p)).length===0;
        
        // Anti-Trap Bulky Hard Cap
        const bulkyInHand = aiPicks.filter(p => PIECE_ROLES.BULKY.has(p)).length;
        if(PIECE_ROLES.BULKY.has(k) && bulkyInHand >= 3) {
            return pool.filter(p => !PIECE_ROLES.BULKY.has(p)).length === 0;
        }

        return true;
      });
      const godPool=godElig.length?godElig:pool;
      return godPool.reduce((b,k)=>godDraftScore(k)>godDraftScore(b)?k:b,godPool[0]);
    }

    const draftHistory=_getDraftHistory();
    const freq={};
    for(const e of draftHistory) for(const pk of(e.humanPicks||[])) freq[pk]=(freq[pk]||0)+1;
    const maxF=Math.max(1,...Object.values(freq));
    const hTargetsBefore=getSynergyTargets(hpPicks,pool).length;
    const humanHasI=hpPicks.includes('I');

    const ELONG_LEG_PRE=['I','L','N','Y']; 
    const COMP_LEG_PRE=['F','W','V','U','X'];
    const elongInHandLeg=aiPicks.filter(p=>ELONG_LEG_PRE.includes(p)).length;
    const poolHasI_Leg=pool.includes('I');
    const poolCompact_Leg=pool.filter(p=>COMP_LEG_PRE.includes(p)).length;
    const humanCompact_Leg=hpPicks.filter(p=>COMP_LEG_PRE.includes(p)).length;
    const proactiveCapLeg=(elongInHandLeg>=1&&poolHasI_Leg&&poolCompact_Leg>=2)?1:2;
    const reactiveCapLeg=(humanHasI&&humanCompact_Leg>=1)?1:2;
    const elongCapLeg=Math.min(proactiveCapLeg,reactiveCapLeg);

    function legScore(pick){
      let s=(SHAPE_SCORE[pick]||2) * 4 * greedMult;

      // ── V5.2 FIX: TRICKY-RIGID CAP (mirrors godDraftScore fix) ──────────
      // Only cap F and N — X and W are denial pieces and must not be suppressed.
      const TRICKY_RIGID_L = ['F', 'N'];
      const trickyInHandL  = aiPicks.filter(p => TRICKY_RIGID_L.includes(p)).length;
      if (TRICKY_RIGID_L.includes(pick) && trickyInHandL >= 1) {
        s -= 22 * greedMult;
      }
      if (['P', 'V', 'U'].includes(pick) && trickyInHandL >= 1) {
        s += 30 * greedMult;
      }
      // ─────────────────────────────────────────────────────────────────────

      // --- NEW: Compact Meta Patch ---
      const compactInHandRole = aiPicks.filter(p => PIECE_ROLES.COMPACT.has(p)).length;
      const humanCompact = hpPicks.filter(p => PIECE_ROLES.COMPACT.has(p) || p === 'X' || p === 'F').length;

      // Anti-hoarding counter
      if (humanCompact >= 2 && ['P','U','F','X'].includes(pick)) {
          s += 35 * denialMult;
      }

      // Forced anchor prioritization
      if (['P','U'].includes(pick) && compactInHandRole === 0) {
          s += 40 * greedMult; 
      }

      // Prevent Bulky stacking if we lack an anchor
      if (PIECE_ROLES.BULKY.has(pick) && compactInHandRole === 0 && (pool.includes('P') || pool.includes('U'))) {
          s -= 15;
      }
      // -------------------------------

      if (pick === 'I') s *= iUtilityModifier;
      for(const hk of hpPicks) if((SYNERGY_PAIRS[hk]||[]).includes(pick)) s += 16 * denialMult;
      const poolAfter=pool.filter(k=>k!==pick);
      s += (hTargetsBefore-getSynergyTargets(hpPicks,poolAfter).length) * 6 * denialMult;
      const hw=Math.min(1,draftHistory.length/5);
      s += ((freq[pick]||0)/maxF) * 20 * hw * denialMult;
      if(!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p))&&PIECE_ROLES.FLEXIBLE.has(pick)) s += 7 * greedMult;
      if(!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))&&PIECE_ROLES.LINEAR.has(pick))     s += 9 * greedMult;
      if(!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))&&PIECE_ROLES.FILLER.has(pick))     s += 5 * greedMult;
      const bl=aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
      if(PIECE_ROLES.BLOCKER.has(pick)&&bl>=1) s-=8;
      if(PIECE_ROLES.BLOCKER.has(pick)&&aiPicks.length<3) s-=5;
      if(['I','L','Y','P','N'].includes(pick)) s+=5;
      if(VERSATILE_PIECES.has(pick)) s+=4;
      if(UNPAIRABLE.has(pick)) s-=6;
      
      const humanCompactCount=hpPicks.filter(p=>['F','W','V','U','X'].includes(p)).length;
      if(pick==='I') s-=humanCompactCount*7;
      
      if(humanHasI){
        if(['F','X','W','U'].includes(pick)) s+=22*denialMult;
        if(['T','X'].includes(pick)) s+=12*greedMult;
      }
      
      if(['F','W','V','U','X'].includes(pick)&&humanCompactCount>=2) s+=22*denialMult;
      if(hpPicks.some(k=>['I','L','Y','N'].includes(k))&&['T','F','X','W','U'].includes(pick)) s += 3 * denialMult;
      if(hpPicks.some(k=>['T','F','Y','X'].includes(k))&&['I','L','P'].includes(pick))         s += 4 * denialMult;

      const aiHasP_L=aiPicks.includes('P'), aiHasU_L=aiPicks.includes('U');
      const hpHasP_L=hpPicks.includes('P'), hpHasU_L=hpPicks.includes('U');
      if(pick==='U'&&aiHasP_L&&pool.includes('U')) s+=50*greedMult;
      if(pick==='P'&&aiHasU_L&&pool.includes('P')) s+=50*greedMult;
      if(pick==='U'&&hpHasP_L&&pool.includes('U')) s+=45*denialMult;
      if(pick==='P'&&hpHasU_L&&pool.includes('P')) s+=45*denialMult;
      if(!aiHasP_L&&!aiHasU_L&&!hpHasP_L&&!hpHasU_L&&(pick==='P'||pick==='U')) s+=10*greedMult;
      if((pick==='P'||pick==='U')&&!hpPicks.includes(pick==='P'?'U':'P')) s+=14*greedMult;

      const hpHasX_Leg = hpPicks.includes('X');
      if (hpHasX_Leg) {
        if (['T', 'N', 'Z', 'P'].includes(pick)) s += 15 * denialMult;
      }
      if (pick === 'X' && !hpHasX_Leg) s += 25 * denialMult; 

      if ((SHAPE_SCORE[pick] || 2) <= 2 && aiPicks.length >= 1) {
        const highUtilNow = pool.filter(p => (SHAPE_SCORE[p] || 2) >= 4).length;
        if (highUtilNow > 0) s *= 0.55;
      }

      return s;
    }
    
    const ELONGATED_PRE=['I','L','N','Y']; 
    const COMPACT_PRE=['F','W','V','U','X'];
    const elongatedInHandNow=aiPicks.filter(p=>ELONGATED_PRE.includes(p)).length;
    const compactInHandNow=aiPicks.filter(p=>COMPACT_PRE.includes(p)).length;
    
    const eligiblePool=pool.filter(k=>{
      if(ELONGATED_PRE.includes(k)&&elongatedInHandNow>=elongCapLeg){
        return pool.filter(p=>!ELONGATED_PRE.includes(p)).length===0; 
      }
      if(COMPACT_PRE.includes(k)&&compactInHandNow>=2&&!humanHasI){
        return pool.filter(p=>!COMPACT_PRE.includes(p)).length===0;
      }
      
      // Anti-Trap Bulky Hard Cap
      const bulkyInHand = aiPicks.filter(p => PIECE_ROLES.BULKY.has(p)).length;
      if(PIECE_ROLES.BULKY.has(k) && bulkyInHand >= 3) {
          return pool.filter(p => !PIECE_ROLES.BULKY.has(p)).length === 0;
      }

      return true;
    });
    
    const scoringPool=eligiblePool.length?eligiblePool:pool;
    return scoringPool.reduce((b,k)=>legScore(k)>legScore(b)?k:b,scoringPool[0]);
  }

  function choosePlacement(moves){
    const diff=aiDifficulty.value;
    if(diff==='easy')      return movesEasy(moves);
    if(diff==='normal')    return movesNormal(moves);
    if(diff==='hard')      return movesTactician(moves);
    if(diff==='master')    return movesGrandmaster(moves);
    if(diff==='expert')    return movesGod(moves);
    if(diff==='ultimate')  return movesGod(moves);
    return movesLegendary(moves);
  }

  function thinkDelay(){
    const diff=aiDifficulty.value;
    const placed=game.placedCount||0;
    const rem=Math.min((game.remaining?.[aiPlayer.value]?.length||6),(game.remaining?.[humanPlayer.value]?.length||6));
    if(game.phase==='draft') return 900+Math.random()*400;

    if(rem<=3){
      const base={easy:200,normal:300,hard:450,master:600,expert:750,ultimate:900};
      return (base[diff]||450)+Math.random()*200;
    }
    if(rem<=5){
      const base={easy:350,normal:500,hard:650,master:800,expert:950,ultimate:1100};
      return (base[diff]||650)+Math.random()*300;
    }

    if(diff==='easy')      return 900+Math.random()*900;
    if(diff==='normal')    return 550+Math.random()*600;
    if(diff==='hard')      return 750+Math.random()*500;
    if(diff==='master')    return 950+Math.random()*600;
    if(diff==='ultimate'){
      if(placed<=2) return 2200+Math.random()*800;
      if(placed<=5) return 1800+Math.random()*600;
      return 1500+Math.random()*500;
    }
    if(placed<=2) return 1500+Math.random()*500;
    if(placed<=5) return 1200+Math.random()*400;
    return 1050+Math.random()*400;
  }

  return{getAllValidMoves,pickDraftPiece,choosePlacement,thinkDelay};
}