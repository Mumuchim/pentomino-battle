/**
 * PentoBattle AI Engine v4.0 — TERRITORY PLANNER + OPPORTUNITY SCANNER + MCTS
 *
 * Difficulty map (internal → UI):
 *   dumbie      → Easy
 *   elite       → Normal
 *   tactician   → Hard
 *   grandmaster → Master
 *   legendary   → Expert    (was Ultimate in v3)
 *   god         → Ultimate  (new in v4 — MCTS + proactive draft + 2-ply draft sim)
 *
 * Power hierarchy:
 *   Easy    — 80% random, no planning
 *   Normal  — Voronoi territory only, weak pressure
 *   Hard    — Territory plan + basic mistake detection
 *   Master  — Full opportunity scanner, plan pivoting, 3-ply minimax
 *   Expert  — Everything + stranded exploitation + opponent disruption + 4-ply
 *   Ultimate— Expert heuristic + MCTS post-filter + proactive draft + 2-ply draft sim
 */

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

const PIECE_ROLES = {
  FLEXIBLE: new Set(['P','L','N','T','Y']),
  LINEAR:   new Set(['I']),
  FILLER:   new Set(['Z']),
  BLOCKER:  new Set(['X','W','F','U']),
};

const VERSATILE_PIECES = new Set(['I','L','T','Y','N','Z','P']);
const TRICKY_PIECES    = new Set(['F','W','X','U','V']);
const UNPAIRABLE       = new Set(['X','W','F','U']);
const SHAPE_SCORE      = { I:5, L:5, Y:5, N:4, T:4, Z:4, P:3, W:3, F:2, U:2, X:1, V:2 };

const SYNERGY_PAIRS = {
  P: ['Z','L','N'], Z: ['P'],
  L: ['P','N'],     N: ['P','L'],
  I: ['I','L','Y','N','Z'], T: ['Y'], Y: ['T','N'],
};

// ─────────────────────────────────────────────────────────────────
//  BOARD UTILITIES
// ─────────────────────────────────────────────────────────────────

function parityImbalance(cells) {
  let b = 0, w = 0;
  for (const [x,y] of cells) (x+y)%2===0 ? b++ : w++;
  return Math.abs(b-w);
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
  // Fix 14 — sort most-constrained cells first (fewer in-zone neighbours = harder to fill)
  // This dramatically reduces backtracking and makes the 80ms budget go much further.
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
    const r=canTileZone(zone.cells,hand,allowFlip,PENTS,xformFn,50); // Fix 14: was 25
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
//  OPPORTUNITY SCANNER  (new v3.1)
//
//  Runs once per AI turn to detect four classes of player mistakes:
//    A) EXPOSED POCKET    — small empty region (≤15) mostly bordered by AI/walls
//    B) STRANDED PIECES   — opponent cells disconnected from their main cluster
//    C) PLAN PIVOT        — current plan harder to seal than a newly exposed zone
//    D) MISTAKE POCKET    — infeasible/parity-bad region adjacent to opponent
//
//  Returns an `opportunities` object used by opportunityBonus().
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

/**
 * Main opportunity scanner — call once at start of AI turn.
 * Returns { exposedPockets, strandedCells, pivotZone, mistakePockets }
 * where each field drives specific bonus functions.
 */
function scanOpportunities(board,W,H,ap,hp,aiHand,currentPlan,allowFlip,PENTS,xformFn){
  const regions=floodFillRegions(board,W,H);

  // ── A) EXPOSED POCKETS ─────────────────────────────────────────
  // Empty regions where AI already controls most of the border.
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
    // "Exposed" = AI already controls >40% of border AND no/few hp edges
    if(sealRatio>=0.4&&hpEdges<=aiEdges*0.5){
      exposedPockets.push({cells:reg,sz,sealRatio,infeasible,parity,hpEdges,aiEdges});
    }
  }
  // Sort best first: high seal ratio, infeasible/parity bonus, small size
  exposedPockets.sort((a,b)=>{
    const va=a.sealRatio*30+(a.infeasible?15:0)+(a.parity?10:0)-(a.sz*0.5);
    const vb=b.sealRatio*30+(b.infeasible?15:0)+(b.parity?10:0)-(b.sz*0.5);
    return vb-va;
  });

  // ── B) STRANDED OPPONENT PIECES ────────────────────────────────
  const strandedCells=findStrandedOpponentCells(board,W,H,hp);

  // ── C) PLAN PIVOT ─────────────────────────────────────────────
  // Check if there's a new exposed zone better than the current plan.
  let pivotZone=null;
  if(currentPlan){
    const currentSeal=getZoneSealProgress(currentPlan,board,W,H,ap);
    // Only consider pivoting if current plan is less than 40% sealed
    if(currentSeal.progress<0.4){
      const newPlan=findBestTerritoryZone(aiHand,board,W,H,ap,hp,allowFlip,PENTS,xformFn,100);
      if(newPlan&&newPlan.score>currentPlan.score*1.25){
        // New plan is meaningfully better — flag it as pivot candidate
        pivotZone=newPlan;
      }
    }
  } else {
    // No current plan — always scan for one
    pivotZone=findBestTerritoryZone(aiHand,board,W,H,ap,hp,allowFlip,PENTS,xformFn,100);
  }

  // ── D) MISTAKE POCKETS ─────────────────────────────────────────
  // Infeasible or parity-bad regions adjacent to opponent territory
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

/**
 * Score a candidate move based on detected opportunities.
 * Higher weight = higher difficulty gets more benefit from exploiting mistakes.
 */
function opportunityBonus(abs,opp,board,simBoard,W,H,ap,hp,weightMult){
  if(!opp) return 0;
  weightMult=weightMult||1.0;
  let bonus=0;
  const simSet=new Set(abs.map(([x,y])=>y*W+x));

  // ── A) Exposed pockets: reward moves that seal or approach them ──
  for(const pkt of opp.exposedPockets.slice(0,4)){
    const pktSet=new Set(pkt.cells.map(([x,y])=>y*W+x));
    // Border cells of pocket
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
    // Check if this move COMPLETES the seal of the pocket
    let hpCanReachAfter=false;
    for(const[x,y]of pkt.cells) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(simBoard[ny][nx]?.player===hp){hpCanReachAfter=true;break;}
      if(hpCanReachAfter) break;
    }
    const hpCouldReachBefore=pkt.hpEdges>0;
    if(hpCouldReachBefore&&!hpCanReachAfter){
      // Seal completed!
      const sealVal=pkt.sz*(pkt.infeasible?55:35)+(pkt.parity?pkt.sz*20:0);
      bonus+=sealVal*weightMult;
    }
  }

  // ── B) Stranded pieces: reward cutting them off further ─────────
  if(opp.strandedCells.length>0){
    const strandedSet=new Set(opp.strandedCells.map(([x,y])=>y*W+x));
    for(const[x,y]of abs) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(strandedSet.has(ny*W+nx)){
        // We placed adjacent to a stranded piece — cutting off escape routes
        bonus+=30*weightMult;
      }
    }
    // Big bonus for isolating the stranded cluster entirely (no empty neighbors)
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

  // ── C) Pivot zone: reward moves that start building new plan ────
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

  // ── D) Mistake pockets: reward moves that lock opponent in them ──
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

// Self-shape read: reward placements that create territory compatible with
// the AI's OWN remaining hand. Mirrors opponentShapeReadScore but asks
// "can I actually fill the space I'm claiming?" instead of "can they fill it?".

// Helper: get all valid absolute placements of a piece on the current board
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

// ── PROACTIVE CAVITY PLANNER ────────────────────────────────────────────────
// Pick a reserved piece and find its ideal future slot so the AI can frame it.
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
      // Count how many OTHER pieces (any) also fit this exact footprint
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

// ── CAVITY FRAMING BONUS ────────────────────────────────────────────────────
// Reward placements adjacent to the reserved cavity; penalize filling it.
function cavityFramingBonus(abs,cavityPlan,simBoard,W,H,ap){
  if(!cavityPlan) return 0;
  let bonus=0;
  for(const[x,y]of abs){
    if(cavityPlan.cellSet.has(y*W+x)){
      bonus-=80; // filling our own reserved slot — bad
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

// ── OPPONENT CAVITY DETECTOR ────────────────────────────────────────────────
// Find the specific piece-shaped hole the opponent is building toward.
// FIXED: scans ALL empty regions, not just ones adjacent to opponent cells.
// The P-trap was bordered by AI pieces + walls so the old adjacency check
// made the danger zone completely invisible.
function detectOpponentCavity(board,W,H,hp,remHp,allowFlip,PENTS,xformFn){
  if(!remHp||!remHp.length) return null;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(board,W,H);
  let bestCavity=null,bestScore=-Infinity;
  for(const reg of regions){
    if(reg.length<5||reg.length>20) continue;
    // Adjacency to opponent is now a scoring bonus, not a hard requirement
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
          const leftover=reg.length-abs.length;
          const snugness=15-leftover;
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

// ── OPPONENT CAVITY INTRUSION BONUS ─────────────────────────────────────────
// Heavily reward moves that place inside the opponent's building cavity.
function opponentCavityIntrusionBonus(abs,oppCavity,W){
  if(!oppCavity) return 0;
  let bonus=0;
  // Extra urgency: exact 5-cell fit = opponent is one move from a sealed trap
  const exactFit=oppCavity.cells&&oppCavity.cells.length===5;
  const baseHit=exactFit?110:70;
  const baseAdj=exactFit?35:20;
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

// Helper: check if a specific piece fits anywhere inside a region
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
    // Only evaluate regions adjacent to own pieces (territory we're actively claiming)
    let adjToSelf=false;
    outer0:for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(simBoard[ny][nx]?.player===ap){adjToSelf=true;break outer0;}
    }
    if(!adjToSelf) continue;

    // Dead pocket penalty — region too small for any piece
    if(reg.length<5){fitScore-=(5-reg.length)*10;continue;}

    // For each of our pieces, check if it fits AND whether opponent's pieces also fit
    // Track which AI pieces fit and which opponent pieces fit
    const aiFitting=[];   // our pieces that fit in this region
    const oppFitting=[];  // opponent pieces that fit in this region

    for(const pk of remAp){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)) aiFitting.push(pk);
    }
    for(const pk of (remHp||[])){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)) oppFitting.push(pk);
    }

    if(!aiFitting.length){
      // We own this region but none of our pieces fit — big problem
      fitScore-=reg.length*8;
      continue;
    }

    const aiRatio=aiFitting.length/remAp.length;
    const oppRatio=remHp?.length?oppFitting.length/remHp.length:0;

    // Base fit reward
    fitScore+=reg.length*aiRatio*6;

    // ── EXCLUSIVE CAVITY BONUS ──────────────────────────────────────
    // This is the key insight: a region where OUR pieces fit but
    // opponent's pieces DON'T is a GUARANTEED future move.
    // Weight this very heavily — it's the endgame decisive advantage.
    if(oppFitting.length===0 && aiFitting.length>0){
      // Completely exclusive: opponent cannot contest this territory at all
      fitScore+=reg.length*18;
      // Extra bonus if region is exactly divisible by 5 (perfectly fillable)
      if(reg.length%5===0) fitScore+=reg.length*8;
    } else if(aiRatio>oppRatio+0.3){
      // Partially exclusive: we fit far more pieces here than opponent
      fitScore+=reg.length*(aiRatio-oppRatio)*10;
    }

    // Penalize regions where opponent fits more pieces than we do
    if(oppRatio>aiRatio) fitScore-=reg.length*(oppRatio-aiRatio)*8;

    // Penalty for non-divisible-by-5 regions (wasted cells)
    if(reg.length%5!==0) fitScore-=(reg.length%5)*4;
  }
  return fitScore;
}


// ── HUMAN STRATEGY 1: P+U EXCLUSIVE PAIR TERRITORY ──────────────────────────
// Human insight: P and U together tile a 2×5 (10-cell) rectangle that is very
// hard for the opponent to contest unless they also have P or U. When the AI
// holds both P and U, it should actively scout for 10-cell connected regions
// adjacent to its own territory where P+U can tile exclusively, then frame
// those regions with its other pieces.
// Also generalises: any 2 pieces the AI holds that together can tile a region
// which the OPPONENT cannot fill (because they lack those pieces) is gold.
function pairExclusiveTerritoryScore(simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length<2) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(simBoard,W,H);
  let totalScore=0;

  // Build all 2-piece combos from AI hand
  for(let i=0;i<remAp.length;i++) for(let j=i+1;j<remAp.length;j++){
    const pkA=remAp[i], pkB=remAp[j];
    const targetSize=10; // 2 pentominoes = 10 cells

    // Find regions of exactly 10 cells (or close) adjacent to AI pieces
    for(const reg of regions){
      if(reg.length<8||reg.length>14) continue;
      let adjToSelf=false;
      for(const[x,y]of reg) for(const[ox,oy]of DIRS){
        const nx=x+ox,ny=y+oy;
        if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===ap){adjToSelf=true;break;}
      }
      if(!adjToSelf) continue;

      // Check if pkA can fit in region
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

      // For each A placement, check if B fills the remainder
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

      // How many opponent pieces can also tile any 5-cell sub-region here?
      let oppCanContest=false;
      for(const pk of (remHp||[])){
        if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)){oppCanContest=true;break;}
      }

      const exclusivityBonus=oppCanContest?30:120;
      // Extra bonus for the famous P+U pair specifically (human's go-to tactic)
      const puBonus=(pkA==='P'&&pkB==='U')||(pkA==='U'&&pkB==='P')?60:0;
      totalScore+=exclusivityBonus+puBonus;
    }
  }
  return Math.min(totalScore,300); // cap to prevent runaway
}

// ── HUMAN STRATEGY 2: MULTI-PIECE COMBO SETUP ───────────────────────────────
// Human insight: deliberately place pieces A and B so their combined shape
// creates a cavity that ONLY piece C from the hand can fill — guaranteeing a
// future placement while opponent has no answer.
// Implementation: for each move being evaluated, check if placing this piece
// + any one other piece in hand would create a 5-cell exclusive region for a
// third piece. If yes, large bonus — this move is "step 1 of a 3-piece combo".
function comboCavitySetupBonus(movAbs,pk,board,simBoard,W,H,ap,hp,remAp,remHp,placedCount,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length<3) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  const otherPieces=remAp.filter(p=>p!==pk);
  let bestBonus=0;

  // For each other piece in hand, simulate placing it on the simBoard
  // and check if a 5-cell exclusive cavity for a 3rd piece would form
  for(const pkB of otherPieces){
    const placementsB=getPiecePlacements(pkB,simBoard,W,H,flipOpts,PENTS,xformFn);
    // Only sample top placements (performance)
    const sample=placementsB.slice(0,12);
    for(const absB of sample){
      // Simulate A+B both placed
      const sim2=simBoard.map(r=>[...r]);
      for(const[x,y]of absB) sim2[y][x]={player:ap,pieceKey:pkB};

      // Find new regions adjacent to AI
      const regions2=floodFillRegions(sim2,W,H);
      for(const reg of regions2){
        if(reg.length!==5) continue; // looking for exactly-5-cell cavities
        let adjToSelf=false;
        for(const[x,y]of reg) for(const[ox,oy]of DIRS){
          const nx=x+ox,ny=y+oy;
          if(nx>=0&&ny>=0&&nx<W&&ny<H&&sim2[ny][nx]?.player===ap){adjToSelf=true;break;}
        }
        if(!adjToSelf) continue;

        // Find 3rd pieces (not pk, not pkB) that fit this cavity
        const thirdPieces=otherPieces.filter(p=>p!==pkB);
        let aiCanFill=false,oppCanFill=false;
        for(const pkC of thirdPieces){
          if(pieceCanFitInRegion(pkC,reg,flipOpts,PENTS,xformFn)){aiCanFill=true;break;}
        }
        for(const pkO of (remHp||[])){
          if(pieceCanFitInRegion(pkO,reg,flipOpts,PENTS,xformFn)){oppCanFill=true;break;}
        }

        if(aiCanFill&&!oppCanFill){
          // Perfect: we set up a 3-piece combo the opponent can't counter
          bestBonus=Math.max(bestBonus,150);
        } else if(aiCanFill&&oppCanFill){
          bestBonus=Math.max(bestBonus,40);
        }
      }
    }
  }
  return bestBonus;
}

// ── HUMAN STRATEGY 3: I-LANE FENCING ────────────────────────────────────────
// Human insight: when holding I, identify the best available 5-cell row or
// column lane and proactively "fence" it — place pieces on both sides of the
// chosen lane so opponent's elongated pieces (L, Y, N) can't snake into it,
// while keeping the lane itself clear. This guarantees the I placement later.
function iLaneFencingBonus(movAbs,pk,board,simBoard,W,H,aiHand,hpHand,allowFlip,PENTS,xformFn){
  if(!aiHand.includes('I')) return 0;
  if(pk==='I') return 0; // already placing I — handled elsewhere
  let bonus=0;

  // Find best candidate I-lane: a full row or column that's still empty
  const flipOpts=allowFlip?[false,true]:[false];
  let bestLane=null,bestLaneScore=-Infinity;

  // Check all rows for horizontal I-lane
  for(let y=0;y<H;y++){
    let clearCount=0;
    for(let x=0;x<W-4;x++){
      let clear=true;
      for(let dx=0;dx<5;dx++) if(board[y][x+dx]!==null){clear=false;break;}
      if(clear) clearCount++;
    }
    if(clearCount>0){
      // Edge rows get a huge multiplier — interior rows are almost never worth fencing
      const edgeBonus=(y===0||y===H-1)?80:(y===1||y===H-2)?20:0;
      const score=clearCount*3+edgeBonus;
      if(score>bestLaneScore){bestLaneScore=score;bestLane={type:'row',y};}
    }
  }
  // Check all columns for vertical I-lane
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

  if(!bestLane) return 0;

  // Bonus: does THIS move place cells adjacent to the lane (fencing it in)
  // WITHOUT occupying the lane itself?
  const laneSet=new Set();
  if(bestLane.type==='row'){
    for(let x=0;x<W;x++) laneSet.add(bestLane.y*W+x);
  } else {
    for(let y=0;y<H;y++) laneSet.add(y*W+bestLane.x);
  }

  let touchesLane=0, blocksLane=false;
  for(const[x,y]of movAbs){
    if(laneSet.has(y*W+x)){blocksLane=true;break;}
    // Check if adjacent to lane
    for(const[ox,oy]of DIRS){
      if(laneSet.has((y+oy)*W+(x+ox))){touchesLane++;break;}
    }
  }

  if(blocksLane) return -200; // heavily penalise moves that step on our I-lane
  if(touchesLane>0) bonus+=touchesLane*25; // reward fencing adjacent to lane

  // Extra: penalise moves that leave opponent's elongated pieces (L/Y/N) able
  // to reach the I-lane after this move
  const elongOpp=['L','Y','N','Z'].filter(p=>(hpHand||[]).includes(p));
  if(elongOpp.length>0){
    // Count I-lane positions still open after this move
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
    // Fencing that reduces available I positions is good
    const before=bestLaneScore/3;
    const reduction=before-laneOpenAfter;
    if(reduction>0&&touchesLane>0) bonus+=reduction*15;
  }

  return bonus;
}

// ── EXCLUSIVE PIECE CAVITY BONUS ────────────────────────────────────────────
// Reward placements that create, maintain, or frame a cavity that ONLY one of
// the AI's held pieces can fill — and the opponent cannot.
// Covers: P-shaped holes, U-shaped holes, 3×2 rectangles (P+U), and any
// exclusive 5-cell shape for pieces in hand.
//
// Also used as a proactive signal: if AI holds P or U and a 3×2 region already
// exists adjacent to AI territory, reward moves that frame/protect that region.
function exclusivePieceCavityBonus(movAbs,pk,board,simBoard,W,H,ap,hp,remAp,remHp,placedCount,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length===0) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  let totalBonus=0;

  // ── Part A: scan NEW 5-cell or 10-cell cavities created by this move ──────
  const regionsBefore=floodFillRegions(board,W,H);
  const regionsAfter=floodFillRegions(simBoard,W,H);

  // Find regions that got SMALLER (or newly formed) after this move
  const beforeSizes=new Map(regionsBefore.map(r=>{
    const key=r.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    return [key,r];
  }));

  for(const reg of regionsAfter){
    if(reg.length<5||reg.length>10) continue;
    const key=reg.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    if(beforeSizes.has(key)) continue; // unchanged region — skip

    // Must be adjacent to AI territory
    let adjToSelf=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===ap){adjToSelf=true;break;}
    }
    if(!adjToSelf) continue;

    // ── 3×2 rectangle check (P+U combo) ──────────────────────────────────
    if(reg.length===10&&remAp.includes('P')&&remAp.includes('U')){
      // Verify it's a 3×2 or 2×3 block
      const xs=reg.map(([x])=>x), ys=reg.map(([,y])=>y);
      const minX=Math.min(...xs),maxX=Math.max(...xs);
      const minY=Math.min(...ys),maxY=Math.max(...ys);
      const is3x2=(maxX-minX===2&&maxY-minY===1)||(maxX-minX===1&&maxY-minY===2);
      if(is3x2){
        const oppContest=(remHp||[]).some(opk=>pieceCanFitInRegion(opk,reg,flipOpts,PENTS,xformFn));
        totalBonus+=oppContest?60:180; // exclusive 3×2 is gold
        continue;
      }
    }

    // ── 5-cell exclusive cavity ───────────────────────────────────────────
    if(reg.length===5){
      const aiFitting=remAp.filter(apk=>pieceCanFitInRegion(apk,reg,flipOpts,PENTS,xformFn));
      const oppFitting=(remHp||[]).filter(opk=>pieceCanFitInRegion(opk,reg,flipOpts,PENTS,xformFn));

      if(aiFitting.length===0) continue; // we can't fill it either — bad

      if(oppFitting.length===0){
        // Completely exclusive cavity — massive bonus
        // Extra bonus if it specifically fits P or U (easiest to set up)
        const puBonus=(aiFitting.includes('P')||aiFitting.includes('U'))?50:0;
        totalBonus+=200+puBonus;
      } else if(aiFitting.length>0&&oppFitting.length<aiFitting.length){
        // Partially exclusive
        totalBonus+=60;
      }
    }
  }

  // ── Part B: proactive framing — protect existing exclusive zones ──────────
  // If a 3×2 or 5-cell exclusive region ALREADY exists (from before this move),
  // reward moves adjacent to it that don't fill it.
  for(const reg of regionsBefore){
    if(reg.length<5||reg.length>10) continue;
    const regSet=new Set(reg.map(([x,y])=>y*W+x));

    // Check exclusivity
    const aiFit=remAp.filter(apk=>pieceCanFitInRegion(apk,reg,flipOpts,PENTS,xformFn));
    const oppFit=(remHp||[]).filter(opk=>pieceCanFitInRegion(opk,reg,flipOpts,PENTS,xformFn));
    if(aiFit.length===0||oppFit.length>0) continue; // not exclusive

    // Does this move fill it? Bad.
    const fillsIt=movAbs.some(([x,y])=>regSet.has(y*W+x));
    if(fillsIt){totalBonus-=150;continue;}

    // Does this move frame (touch) the exclusive region? Good.
    let frames=0;
    for(const[mx,my]of movAbs) for(const[ox,oy]of DIRS){
      if(regSet.has((my+oy)*W+(mx+ox))){frames++;break;}
    }
    if(frames>0) totalBonus+=frames*35;
  }

  return totalBonus;
}

// ── FORK THREAT DETECTOR ────────────────────────────────────────────────────
// A fork threat exists when the opponent's pieces border 2+ DISTINCT open
// zones of meaningful size (≥5 cells). This forces the AI to defend two
// fronts simultaneously — the classic fork problem.
//
// Returns { active, zones, pivotCells, severity } where:
//   zones      = array of region arrays the opponent threatens
//   pivotCells = Set of cells that, if occupied, would cut the connection
//                between two threatened zones (the fork "pivot")
//   severity   = size of the smaller threatened zone (higher = more urgent)
function detectForkThreat(board,W,H,hp,remHp,allowFlip,PENTS,xformFn){
  const regions=floodFillRegions(board,W,H);

  // Find all open regions that the opponent's pieces border
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

  // Compute severity: the smallest threatened zone (hardest to match if human
  // commits to it) — small zones are the most urgent to contest or cut off
  const sortedBySize=[...threatenedRegions].sort((a,b)=>a.length-b.length);
  const severity=sortedBySize[0].length; // smallest zone = most urgent threat

  // Compute pivot cells: empty cells adjacent to 2+ distinct threatened regions
  // Placing AI piece here would cut the fork's connections
  const pivotCells=new Set();
  const regionIndex=new Map(); // cell → region index
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
    // Also check the cell itself
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

// ── FORK COUNTER BONUS ───────────────────────────────────────────────────────
// Three counter-strategies, scored and summed:
//
// 1. PIVOT OCCUPATION: if this move lands on/near a fork pivot cell → big bonus.
//    Breaking the pivot cuts the opponent's connection to one of their zones.
//
// 2. ZONE ISOLATION (speed-seal): if this move helps AI fully seal/claim one of
//    the two threatened zones before the opponent can develop it → bonus.
//    "Take one for free while they develop the other."
//
// 3. ZONE COMMITMENT PENALTY: if this move neither threatens a pivot NOR
//    advances into a threatened zone → small penalty (AI is ignoring the fork).
function forkCounterBonus(movAbs,board,simBoard,W,H,ap,hp,forkThreat){
  if(!forkThreat||!forkThreat.active) return 0;
  const {pivotCells,zones,severity}=forkThreat;
  let bonus=0;

  // ── Strategy 1: Pivot occupation ──────────────────────────────────────────
  let hitsPivot=false;
  for(const[x,y]of movAbs){
    if(pivotCells.has(y*W+x)){hitsPivot=true; bonus+=120; break;}
    // Adjacent to pivot is also valuable
    for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&pivotCells.has(ny*W+nx)){bonus+=45; break;}
    }
  }

  // ── Strategy 2: Speed-seal the smaller threatened zone ────────────────────
  // Check if this move advances into the smallest threatened zone (most urgent)
  const smallestZone=zones.reduce((a,b)=>a.length<b.length?a:b);
  const smallZoneSet=new Set(smallestZone.map(([x,y])=>y*W+x));

  let cellsInSmallZone=0;
  for(const[x,y]of movAbs) if(smallZoneSet.has(y*W+x)) cellsInSmallZone++;

  // After this move, how many AI-adjacent cells does the small zone have?
  let aiZonePressure=0;
  for(const[x,y]of smallestZone) for(const[ox,oy]of DIRS){
    const nx=x+ox,ny=y+oy;
    if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===ap) aiZonePressure++;
  }

  if(cellsInSmallZone>0) bonus+=cellsInSmallZone*30; // entering the contested zone
  if(aiZonePressure>0) bonus+=aiZonePressure*8; // pressuring it from outside

  // Severity scaling: smaller zone = more urgent
  const urgency=Math.min(1.5,20/Math.max(5,severity));
  bonus*=urgency;

  return bonus;
}

// ── COOPERATIVE CAVITY PENALTY ───────────────────────────────────────────────
// The most insidious AI mistake: placing a piece that FRAMES or CREATES a region
// where only the opponent's remaining pieces fit. The AI is literally building
// the walls of the human's exclusive cavity.
//
// This is the inverse of exclusivePieceCavityBonus — instead of rewarding AI for
// creating its own exclusive zones, we PENALISE AI for creating the opponent's.
//
// Penalty is proportional to: region size × how exclusively the opponent fits it.
function cooperativeCavityPenalty(movAbs,board,simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remHp||remHp.length===0) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  let totalPenalty=0;

  const regionsBefore=floodFillRegions(board,W,H);
  const regionsAfter=floodFillRegions(simBoard,W,H);

  // Build lookup of regions that changed
  const beforeKeys=new Set(regionsBefore.map(r=>r.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',')));

  for(const reg of regionsAfter){
    if(reg.length<5||reg.length>15) continue;
    const key=reg.map(([x,y])=>y*W+x).sort((a,b)=>a-b).join(',');
    if(beforeKeys.has(key)) continue; // region unchanged — skip

    // Only care about regions adjacent to OPPONENT pieces (human's developing territory)
    let adjToOpp=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H&&simBoard[ny][nx]?.player===hp){adjToOpp=true;break;}
    }
    if(!adjToOpp) continue;

    // Check who fits in this region
    const oppFitting=remHp.filter(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));
    const aiFitting=(remAp||[]).filter(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));

    if(oppFitting.length===0) continue; // opponent can't use it either — fine

    // Did THIS move's cells touch this region? (i.e., did AI just frame it?)
    let aiFramed=false;
    const regSet=new Set(reg.map(([x,y])=>y*W+x));
    for(const[mx,my]of movAbs) for(const[ox,oy]of DIRS){
      if(regSet.has((my+oy)*W+(mx+ox))){aiFramed=true;break;}
    }
    if(!aiFramed) continue; // AI didn't create this framing

    if(aiFitting.length===0){
      // Worst case: AI just framed a cavity ONLY the opponent can use
      totalPenalty+=reg.length*28; // severe
    } else if(oppFitting.length>aiFitting.length){
      // Opponent fits more pieces here than AI — AI is helping them more than itself
      const ratio=(oppFitting.length-aiFitting.length)/Math.max(1,remHp.length);
      totalPenalty+=reg.length*ratio*14;
    }
  }

  return -totalPenalty; // negative = penalty in scoring context
}

// ── ABANDONED ZONE PENALTY ───────────────────────────────────────────────────
// When the board has 2+ large open zones and the AI has placed ALL its recent
// pieces in only ONE zone, penalise moves that continue this pattern.
// Specifically: if opponent borders a zone ≥8 cells that AI has NO pieces
// adjacent to, and this move ALSO doesn't enter that zone, it's zone abandonment.
//
// This catches Game 2 (AI played left while human took center+right) and
// Game 3 (AI played center+right while human took left).
function abandonedZonePenalty(movAbs,simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remHp||remHp.length===0) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(simBoard,W,H);
  let penalty=0;

  for(const reg of regions){
    if(reg.length<8) continue; // only significant zones

    // Check if opponent borders this zone but AI does NOT
    let oppBorders=false, aiBorders=false;
    for(const[x,y]of reg) for(const[ox,oy]of DIRS){
      const nx=x+ox,ny=y+oy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const p=simBoard[ny][nx]?.player;
      if(p===hp) oppBorders=true;
      if(p===ap) aiBorders=true;
    }

    if(!oppBorders||aiBorders) continue; // not an abandoned zone

    // This zone is opponent-adjacent but AI-absent after this move.
    // Check if AI's remaining pieces can even fit here (if not, it's already lost)
    const aiFit=(remAp||[]).some(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));
    const oppFit=remHp.some(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn));

    if(!oppFit) continue; // opponent can't use it either — fine
    if(!aiFit){
      // AI can't fit anything here anyway — penalise less (unavoidable)
      penalty+=reg.length*5;
      continue;
    }

    // AI has pieces that COULD go here but this move didn't enter the zone
    // Penalty scales with zone size and how many opponent pieces fit
    const oppFitCount=remHp.filter(pk=>pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)).length;
    penalty+=reg.length*oppFitCount*4;
  }

  return -penalty; // negative = penalty
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


// ── ENDGAME PARITY VALIDATOR ─────────────────────────────────────────────────
// In late game (≤4 pieces each), after simulating a placement, check every
// empty region against the AI's remaining hand. If any region exists that
// NONE of AI's pieces can fill, it will become a dead zone — penalize hard.
// Also penalize if opponent has a region that ONLY their pieces fit (trap setup).
function endgameParityScore(simBoard,W,H,ap,hp,remAp,remHp,allowFlip,PENTS,xformFn){
  if(!remAp||remAp.length>6) return 0;
  // Full weight at ≤4 pieces; lighter (45%) at 5-6 so it blends in smoothly
  const weightMul = remAp.length > 4 ? 0.45 : 1.0;
  const flipOpts=allowFlip?[false,true]:[false];
  const regions=floodFillRegions(simBoard,W,H);
  let score=0;
  for(const reg of regions){
    if(reg.length<5) continue; // sub-5 regions are already dead
    const size=reg.length;
    // Check which AI pieces fit this region
    let aiFits=0;
    for(const pk of remAp){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)){aiFits++;break;}
    }
    // Check which opponent pieces fit this region
    let oppFits=0;
    for(const pk of remHp){
      if(pieceCanFitInRegion(pk,reg,flipOpts,PENTS,xformFn)){oppFits++;break;}
    }

    if(aiFits===0 && size%5===0){
      // AI cannot use this region at all — dead zone forming
      score-=size*(size<=5?60:size<=10?40:20)*weightMul;
    } else if(aiFits===0 && size%5!==0){
      score-=size*15*weightMul;
    } else if(oppFits>0 && aiFits===0){
      // Opponent can use it, AI cannot — worst case
      score-=size*50*weightMul;
    } else if(oppFits===0 && aiFits>0 && size===5){
      // Only AI fits this exact 5-cell region — great!
      score+=size*30*weightMul;
    }
  }
  return score;
}

// ── MOST-CONSTRAINED-PIECE-FIRST (MCPF) ────────────────────────────────────
// Compute how many valid placements each piece in hand has on the current board.
// Returns a Map: pieceKey → placement count.
// "Most constrained" = fewest placements = play it FIRST or risk getting stuck.
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

// Returns a flat score bonus based on MCPF urgency.
// Most constrained piece = huge bonus to ensure it's played first.
// Least constrained = penalty to defer it.
function mcpfUrgencyBonus(pk, placementCounts) {
  if (!placementCounts || !placementCounts.size) return 0;
  const counts = [...placementCounts.values()];
  const minCount = Math.min(...counts);
  const myCount = placementCounts.get(pk) ?? 999;
  if (myCount === 0)          return  900; // already dead — emergency play
  if (myCount === minCount)   return  700; // most constrained
  if (myCount <= minCount*1.5) return  250; // nearly as constrained
  if (myCount <= minCount*3)   return    0; // average
  return -250; // least constrained — defer
}

// ── ALL-PIECE VIABILITY CHECK ───────────────────────────────────────────────
// After simulating a move, verify every remaining piece still has ≥1 placement.
// Returns a score: 0 if all pieces viable, large negative if any piece is stranded.
// This is the definitive "don't paint yourself into a corner" check.
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
      // This move strands a piece — catastrophic
      penalty -= (pk === 'I' ? 800 : 500);
    }
  }
  return penalty;
}
// After simulating a placement, check if the AI's hardest-to-place pieces
// (especially I) still have valid placements anywhere on the board.
// If a piece is now completely stranded, apply a massive penalty — this is
// the core fix for the "I-piece gets stuck" failure mode.
function linearPieceSurvivalPenalty(simBoard,W,H,remAp,allowFlip,PENTS,xformFn){
  const hardPieces=remAp.filter(p=>['I','L','N','Y','Z'].includes(p));
  if(!hardPieces.length) return 0;
  const flipOpts=allowFlip?[false,true]:[false];
  let penalty=0;
  for(const pk of hardPieces){
    let hasPlacement=false;
    outer:for(const flip of flipOpts){
      for(let rot=0;rot<4;rot++){
        const shape=xformFn(PENTS[pk],rot,flip);
        for(let ay=0;ay<H;ay++){
          for(let ax=0;ax<W;ax++){
            let valid=true;
            for(const[dx,dy]of shape){
              const x=ax+dx,y=ay+dy;
              if(x<0||y<0||x>=W||y>=H||simBoard[y][x]!==null){valid=false;break;}
            }
            if(valid){hasPlacement=true;break outer;}
          }
        }
      }
    }
    if(!hasPlacement){
      // I-piece stranded = almost certain loss; other elongated = very bad
      penalty-=(pk==='I'?500:250);
    }
  }
  return penalty;
}

// ── I-PIECE URGENCY ──────────────────────────────────────────────────────────
// The I-piece needs an open 5-in-a-row lane. As the board fills, those lanes
// disappear. Give a growing bonus for PLAYING I before the board fragments.
// This directly counters the human strategy of collapsing open rows early.
function iPieceUrgencyBonus(pk,placedCount,boardW,boardH){
  if(pk!=='I') return 0;
  const fillRatio=(placedCount*5)/(boardW*boardH);
  if(fillRatio<0.15) return 0;
  return fillRatio*90;
}

// ── I-PIECE EDGE PLACEMENT ENFORCER ──────────────────────────────────────────
// Placing I in the interior of the board (not on an edge row/column) is almost
// always a strategic blunder — it divides the board and forces the AI to abandon
// one half. Returns large bonus for edge placements, heavy penalty for interior.
//
// EDGE definitions (10×6 board):
//   Horizontal: row 0 or row H-1 (y=0 or y=5)
//   Vertical:   column 0 or column W-1 (x=0 or x=9)
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
    if(row===0||row===H-1) return 180;  // top/bottom edge row — ideal
    if(row===1||row===H-2) return 60;   // one row in — acceptable
    return -220;                         // interior row — punish hard
  }
  // Vertical
  const col=xs[0];
  if(col===0||col===W-1) return 180;   // left/right edge column — ideal
  if(col===1||col===W-2) return 60;    // one column in — acceptable
  return -220;                          // interior column — punish hard
}

// ── I-LANE CLOSING BONUS ──────────────────────────────────────────────────────
// When the human still has I in hand, reward moves that break up open 5-in-a-row
// lanes (horizontal or vertical) on the board. An "I-lane" is any contiguous run
// of 5+ empty cells in a straight line. Placing into one breaks it permanently.
function iLaneClosingBonus(abs,board,simBoard,W,H){
  // Find all I-lanes on the PRE-move board
  const lanes=[];
  // Horizontal
  for(let y=0;y<H;y++){
    let run=0,start=0;
    for(let x=0;x<=W;x++){
      if(x<W&&board[y][x]===null){if(!run) start=x; run++;}
      else{if(run>=5) for(let i=start;i<start+run;i++) lanes.push(y*W+i); run=0;}
    }
  }
  // Vertical
  for(let x=0;x<W;x++){
    let run=0,start=0;
    for(let y=0;y<=H;y++){
      if(y<H&&board[y][x]===null){if(!run) start=y; run++;}
      else{if(run>=5) for(let j=start;j<start+run;j++) lanes.push(j*W+x); run=0;}
    }
  }
  if(!lanes.length) return 0;
  const laneSet=new Set(lanes);
  // Check which lanes are broken by simBoard (i.e. we placed into them)
  let bonus=0;
  for(const[x,y]of abs){
    if(laneSet.has(y*W+x)) bonus+=28; // placing into an I-lane = good
  }
  // Also: count how many I-lanes survive on the simBoard (fewer = better)
  // Reward moves that eliminate the most lanes
  let lanesBefore=0,lanesAfter=0;
  // Horizontal sim-check
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

// ── FIX 2: Count I-lanes that are actually reachable (touch an existing piece) ──
// Returns the number of distinct 5-in-a-row runs of empty cells that an I-piece
// could legally land on. Used to penalise moves that leave lanes open when the
// opponent holds I.
function countReachableILanes(board,W,H){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  let count=0;
  // Horizontal
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
  // Vertical
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

// ── FIX 6 helper: check if a single piece has ANY valid placement on the board ──
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

// ══════════════════════════════════════════════════════════════════════════
//  MCTS (MONTE CARLO TREE SEARCH) HELPERS  —  Ultimate difficulty only
//  These functions implement fast random game playouts used to estimate
//  true win probability for candidate moves beyond the heuristic horizon.
// ══════════════════════════════════════════════════════════════════════════

// Lazily-built lookup of all unique piece orientations.
// Avoids repeated transformCells calls inside hot rollout loops.
// NOTE: must be called with PENTS and xformFn since they are not module-level globals.
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

// Single random game playout starting from `board` (AI has already placed a piece).
// `nextTurn` is the player who moves first in this rollout.
// Uses rejection-sampling random placement (fast, slightly approximate).
// Returns the winning player number (ap or hp).
// ── SMART ROLLOUT HELPER: count valid placements for a piece on board ──────────
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

// Collect all valid placements for a piece, returning abs-cell arrays.
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

/**
 * Smart rollout: uses MCPF (most-constrained-piece-first) ordering.
 * For each player, we play the piece with fewest remaining placements first
 * (the one most at risk of getting stuck). Within a piece, pick a random
 * valid placement. This makes rollouts ~3× more representative of good play
 * than pure random, without adding meaningful compute cost.
 */
function fastRolloutGame(board,W,H,ap,hp,nextTurn,remaining,placed,godShapes){
  const b=board.map(r=>[...r]);
  const rem={[ap]:[...(remaining[ap]||[])],[hp]:[...(remaining[hp]||[])]};
  let curr=nextTurn,pc=placed;
  for(let turn=0;turn<20;turn++){
    const hand=rem[curr];
    if(!hand.length) return curr===ap?hp:ap;

    // ── MCPF ordering: sort hand by ascending placement count ──────
    // Piece with 0 placements is stranded — playing it "wins" the tie
    // (we're already lost that piece, so surface it to the top so the
    // rollout terminates correctly rather than silently stranding it).
    const counted=hand.map(pk=>({pk,cnt:_rolloutPlacementCount(pk,b,W,H,pc,godShapes)}));
    counted.sort((a,b)=>a.cnt-b.cnt);

    let done=false;
    for(const{pk,cnt} of counted){
      if(done) break;
      if(cnt===0) continue; // stranded — skip (handled by !done check below)
      const placements=_rolloutGetPlacements(pk,b,W,H,pc,godShapes);
      if(!placements.length) continue;
      // Pick a random valid placement from the enumerated list
      const abs=placements[0|Math.random()*placements.length];
      for(const[x,y]of abs) b[y][x]={player:curr,pieceKey:pk};
      rem[curr]=rem[curr].filter(p=>p!==pk);
      pc++;done=true;
    }

    if(!done) return curr===ap?hp:ap; // can't move = lose
    curr=curr===ap?hp:ap;
  }
  return ap;
}

// Run `numRollouts` random games starting from the board state AFTER candidate
// move `m` has been applied.  Returns AI win-rate in [0,1].
function fastMCTS(m,board,W,H,ap,hp,remaining,placed,godShapes,numRollouts){
  // Apply candidate move to simulation board
  const simBoard=board.map(r=>[...r]);
  for(const[x,y]of m.abs) simBoard[y][x]={player:ap,pieceKey:m.pk};
  const simRem={[ap]:(remaining[ap]||[]).filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
  const nextTurn=hp; // after AI places, human moves first in rollout
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

// ─────────────────────────────────────────────────────────────────
//  FACTORY
// ─────────────────────────────────────────────────────────────────

export function createAiEngine({game,aiPlayer,humanPlayer,aiDifficulty,PENTOMINOES,transformCells,getDraftHistory}){
  const _getDraftHistory=typeof getDraftHistory==='function'?getDraftHistory:()=>[];

  const _moveCache=new Map(),_moveCountCache=new Map(),_feasibleCache=new Map();
  const CACHE_MAX=400;
  function _evict(map){if(map.size>CACHE_MAX) map.delete(map.keys().next().value);}

  // Territory plan state
  let _plan=null,_planSig=null;
  // Opponent zone (Ultimate)
  let _oppZone=null,_oppZoneSig=null;
  // Opportunity state
  let _opp=null,_oppBoardSig=null;

  function _bsig(board,W,H){
    let s='';
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const c=board[y][x];
      s+=c===null?'.':(c?.player===1?'1':'2');
    }
    return s;
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

  function quickScore(simBoard,ap,hp,bW,bH){
    const t=territoryAdvantage(simBoard,bW,bH,ap,hp);
    const regs=floodFillRegions(simBoard,bW,bH);
    const trap=regionFeasibilityBonus(regs,simBoard,bW,bH,hp);
    const fr=frontierScore(simBoard,bW,bH,ap,hp);
    const largest=regs.length?regs.reduce((a,b)=>b.length>a.length?b:a,regs[0]):null;
    const openZ=largest?largest.length*0.18:0;
    const cluster=aiClusterPenalty(simBoard,bW,bH,ap);
    const seal=territorySealScore(simBoard,bW,bH,ap,hp,regs);
    return t*12+trap*0.25+fr*0.9+openZ+cluster*1.5+seal*0.4;
  }

  function connectivityBeam(moves,board,bW,bH,ap,hp,beamSize){
    if(!moves.length) return[];
    const aiOcc=new Set();
    for(let y=0;y<bH;y++) for(let x=0;x<bW;x++)
      if(board[y][x]?.player===ap) aiOcc.add(y*bW+x);
    const conn=[],disc=[];
    for(const m of moves){
      const sim=board.map(r=>[...r]);
      for(const[x,y]of m.abs) sim[y][x]={player:ap,pieceKey:m.pk};
      const qs=quickScore(sim,ap,hp,bW,bH);
      let touches=!aiOcc.size;
      if(!touches){
        outer:for(const[x,y]of m.abs) for(const[ox,oy]of DIRS){
          const nx=x+ox,ny=y+oy;
          if(nx>=0&&ny>=0&&nx<bW&&ny<bH&&aiOcc.has(ny*bW+nx)){touches=true;break outer;}
        }
      }
      (touches?conn:disc).push({m,s:qs});
    }
    conn.sort((a,b)=>b.s-a.s); disc.sort((a,b)=>b.s-a.s);
    const beam=conn.slice(0,beamSize);
    if(beam.length<beamSize) beam.push(...disc.slice(0,beamSize-beam.length));
    return beam;
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

  // ── Plan management ───────────────────────────────────────────
  function getOrComputePlan(hand,board,W,H,ap,hp,allowFlip,opp){
    const sig=_bsig(board,W,H)+'|'+hand.slice().sort().join('');
    if(_plan&&_planSig===sig) return _plan;
    if(_plan&&isZoneIntruded(_plan,board,W,H,hp)) _plan=null;

    // If opportunity scanner found a better pivot zone, adopt it
    if(opp?.pivotZone&&(!_plan||opp.pivotZone.score>(_plan.score||0)*1.1)){
      _plan=opp.pivotZone;
      _planSig=sig;
      return _plan;
    }

    const plan=findBestTerritoryZone(hand,board,W,H,ap,hp,allowFlip,PENTOMINOES,transformCells);
    _plan=plan; _planSig=sig; return _plan;
  }

  // ── Opportunity management ─────────────────────────────────────
  function getOrScanOpportunities(board,W,H,ap,hp,aiHand,allowFlip){
    const sig=_bsig(board,W,H);
    if(_opp&&_oppBoardSig===sig) return _opp;
    _opp=scanOpportunities(board,W,H,ap,hp,aiHand,_plan,allowFlip,PENTOMINOES,transformCells);
    _oppBoardSig=sig;
    return _opp;
  }

  // ── Endgame solver ────────────────────────────────────────────
  function endgameSolve(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const diff=aiDifficulty.value;
    const aiHand=remaining[ap]||[];
    const useRes=(diff==='expert'||diff==='master')&&aiHand.length>3;
    const keyPieces=useRes?identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells):null;
    const plan=_plan;

    // Endgame MCPF: always play the most constrained piece in late game
    const egPlacementCounts=(diff==='expert'||diff==='master')
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
      let score=(aiC-hpC)*22+regionFeasibilityBonus(regions,sim,boardW,boardH,hp)*1.6
              +territoryAdvantage(sim,boardW,boardH,ap,hp)*8+aiClusterPenalty(sim,boardW,boardH,ap)*1.5
              +sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*4
              +territorySealScore(sim,boardW,boardH,ap,hp)*2.5
              +zoneSealBonus(regions,board,sim,boardW,boardH,hp)*2.5
              +allPiecesViabilityScore(sim,boardW,boardH,rem[ap],placedCount+1,allowFlip,PENTOMINOES,transformCells);
      if(plan) score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*3;
      if(keyPieces) score+=pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiHand.length)*1.2;
      if(diff==='expert'||diff==='master'){
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
      // Apply MCPF urgency in endgame too
      if(egPlacementCounts){
        score+=mcpfUrgencyBonus(m.pk,egPlacementCounts);
      }
      if(score>bestScore){bestScore=score;best=m;}
    }
    return best;
  }

  // ════════════════════════════════════════════════════════════════
  //  EASY (dumbie) — purely random, occasionally walls
  //  No territory awareness. Loses intentionally to feel beatable.
  // ════════════════════════════════════════════════════════════════
  function movesEasy(moves){
    if(!moves.length) return null;
    // 80% pure random
    if(Math.random()<0.80) return moves[Math.floor(Math.random()*moves.length)];
    // 20%: weakly prefer adjacency to opponent (at least looks intentional)
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

  // ════════════════════════════════════════════════════════════════
  //  NORMAL (elite) — Voronoi territory + weak pressure
  //  No territory plan. No opportunity scanner.
  //  Beats Easy reliably but loses to a decent player.
  // ════════════════════════════════════════════════════════════════
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
      s+=Math.random()*0.3; // slight noise so it's not perfectly consistent
      if(s>bScore){bScore=s;best=m;}
    }
    return best;
  }

  // ════════════════════════════════════════════════════════════════
  //  HARD (tactician) — Territory plan + basic mistake detection
  //  Finds a zone, seals it, fills it.
  //  Uses opportunityBonus at 0.5x weight for exposed pockets only.
  //  No stranded exploitation. No plan pivot. No 3-ply lookahead.
  // ════════════════════════════════════════════════════════════════
  function movesTactician(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    if((remaining[ap]?.length||0)<=3||(remaining[hp]?.length||0)<=3) return endgameSolve(moves);

    const aiHand=remaining[ap]||[];
    // Scan opportunities at reduced fidelity (no pivot)
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,null); // no pivot for Hard
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const baseBeam=isMirrorWar(boardW,boardH)?18:30;
    // Fix 15 — widen beam when the board has many disconnected regions, which signals
    // unusual/wide human play that a fixed beam would miss.
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

      // Territory plan (primary)
      if(plan){
        let pw=3.5; if(seal&&seal.progress>0.7) pw=7;
        score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*pw;
      }

      // Opportunity: exposed pockets ONLY (no stranded, no pivot) at 0.5x
      score+=opportunityBonus(m.abs,{...opp,pivotZone:null,strandedCells:[]},board,sim,boardW,boardH,ap,hp,0.5);

      score+=sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*3;
      score+=territorySealScore(sim,boardW,boardH,ap,hp)*1.5;
      score+=endgameParityScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)*2.5;
      score+=simulateOppResponse(sim,ap,hp,boardW,boardH,rem,placedCount+1,allowFlip)*0.7;

      if(score>bScore){bScore=score;best=m;}
    }
    return best;
  }

  // ════════════════════════════════════════════════════════════════
  //  MASTER (grandmaster) — Full opportunity scanner + plan pivot
  //  + 3-ply minimax + piece reservation + dynamic weights
  //  Reactive: will abandon old plan if player opens a better zone.
  //  Uses opportunityBonus at 1.0x weight (all 4 systems active).
  // ════════════════════════════════════════════════════════════════
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

    // Scan ALL opportunities first (all 4 systems)
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);

    // Plan WITH pivot: Master will switch if a better zone appears
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,opp);
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;
    const zoneSealed=seal?.isSealed??false;

    // Piece cavity plan: reserve a specific piece slot and frame it
    const cavityPlan=buildPieceCavityPlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,PENTOMINOES,transformCells);

    // Opponent cavity: detect the shape they're building toward and intrude
    const hpHand=remaining[hp]||[];
    const oppCavity=detectOpponentCavity(board,boardW,boardH,hp,hpHand,allowFlip,PENTOMINOES,transformCells);

    const keyPieces=identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells);
    if(plan) for(const pk of plan.pieces) keyPieces.set(pk,(keyPieces.get(pk)||0)+60);

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const baseBeam=mw?35:55;
    // Fix 15 — adaptive beam
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

      // Territory plan (primary)
      if(plan){
        let pw=zoneSealed?4:7*dw.earlyBoost;
        if(!zoneSealed&&seal&&seal.progress>0.5) pw*=1.5;
        if(!zoneSealed&&seal&&seal.progress>0.8) pw*=2;
        score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*pw;
      }

      // FULL opportunity scanner at 1.0x weight
      score+=opportunityBonus(m.abs,opp,board,sim,boardW,boardH,ap,hp,1.0);

      score+=articulationCutBonus(m.abs,board,sim,boardW,boardH,ap,hp,preAPs,regs)*2;
      score+=territorySealScore(sim,boardW,boardH,ap,hp)*2;
      score+=boardSplitBonus(m.abs,board,sim,boardW,boardH,ap,hp)*2.5;

      if(dw.progress>(mw?0.4:0.2))
        score+=opponentShapeReadScore(sim,boardW,boardH,hp,rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)*dw.lateBoost*1.5;

      // Self-shape read: reward territory compatible with own remaining hand
      score+=selfShapeReadScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)*1.8;

      // Cavity framing: reward moves that frame our reserved piece slot
      score+=cavityFramingBonus(m.abs,cavityPlan,sim,boardW,boardH,ap)*2.0;

      // Opponent cavity intrusion: place inside the shape they're building
      score+=opponentCavityIntrusionBonus(m.abs,oppCavity,boardW)*2.0;

      score+=pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiPC)*2;
      score+=sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*2.5;
      score+=endgameParityScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)*2.5;
      score+=(hpHand.includes('I')?iLaneClosingBonus(m.abs,board,sim,boardW,boardH)*1.8:0);

      // 3-ply minimax
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
          // After human's worst-case response, verify AI's remaining pieces still fit.
          // If they don't, this move path leads to stranded pieces — catastrophic.
          const viabAfterHuman=allPiecesViabilityScore(wBoard,boardW,boardH,wRem[ap],placedCount+2,allowFlip,PENTOMINOES,transformCells);
          wS+=viabAfterHuman; // negative if pieces stranded after human moves
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

  // ════════════════════════════════════════════════════════════════
  //  EXPERT (legendary) — Everything + stranded exploitation
  //  + opponent zone disruption + history draft + widest beam
  //  opportunityBonus at 1.5x weight (stranded & pivot fully active).
  //  Blunder prevention. Adaptive aggression.
  //  When returnTopK>0, returns sorted array of top-K moves (for god level).
  // ════════════════════════════════════════════════════════════════
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

    // ── MCPF HARD PRE-FILTER ─────────────────────────────────────────────────
    // Before expensive scoring: if ANY piece in hand has 0 or 1 valid placements,
    // ONLY evaluate moves for that piece (most-constrained-first, hard constraint).
    // This is the definitive fix for "AI plays compact pieces first and strands I/L/N".
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
            cnt++; if(cnt>=2) break outer_pre; // only need to know: 0,1, or 2+
          }
        }
        if(cnt<minCnt){minCnt=cnt;minPk=pk;}
      }
      // Hard filter: if most-constrained piece has ≤1 placement, only consider its moves
      if(minCnt<=1&&minPk){
        const filtered=moves.filter(m=>m.pk===minPk);
        if(filtered.length){
          // If exactly one placement → return it immediately (no scoring needed)
          if(filtered.length===1) return returnTopK>0?[filtered[0]]:filtered[0];
          moves=filtered; // restrict beam to only this piece
        }
      }
    }
    const _topKK=returnTopK;

    // topK tracking for god level
    const _topKList=returnTopK>0?[]:null;
    const dw=getDynamicWeights(board,boardW,boardH,ap,hp,placedCount,totalPieces);
    const aggMult=Math.max(1,dw.aggression);
    const aiHand=remaining[ap]||[];
    const hpHand=remaining[hp]||[];

    // ── MCPF: compute placement counts for every piece in hand ──────────────
    // Used to overwhelmingly bias toward playing the most-constrained piece first.
    const placementCounts=computePiecePlacementCounts(aiHand,board,boardW,boardH,placedCount,allowFlip,PENTOMINOES,transformCells);

    // ── FIX 4: T-as-row-blocker urgency override ─────────────────────────────
    // When opponent has I AND multiple live I-lanes exist, T's strategic value
    // vastly exceeds its raw placement-count rank. Force it to max-urgency so the
    // MCPF bonus overwhelmingly biases toward playing T next.
    if(hpHand.includes('I')&&aiHand.includes('T')){
      const laneCountNow=countReachableILanes(board,boardW,boardH);
      if(laneCountNow>=2) placementCounts.set('T',0); // 0 = most constrained → 700pt bonus
    }

    // ── FIX 6: Future viability degradation signal ───────────────────────────
    // Simulate every human I-placement. If any of them would strand one of our
    // elongated pieces, pre-emptively treat that elongated piece as most-constrained
    // so we play it before the I-sweep lands.
    const ELONGATED_PIECES=['L','N','Y','Z']; // not I itself; I is handled by iPieceUrgencyBonus
    const aiElongated=aiHand.filter(p=>ELONGATED_PIECES.includes(p));
    if(hpHand.includes('I')&&aiElongated.length){
      const iMoves=movesOnBoard(hp,board,boardW,boardH,remaining,placedCount,allowFlip)
        .filter(mv=>mv.pk==='I');
      for(const im of iMoves){
        const simI=board.map(r=>[...r]);
        for(const[x,y]of im.abs) simI[y][x]={player:hp,pieceKey:'I'};
        for(const pk of aiElongated){
          if(!pieceHasAnyPlacement(simI,pk,boardW,boardH,placedCount+1,allowFlip,PENTOMINOES,transformCells)){
            // This elongated piece dies if human plays I here — treat as dead now
            const cur=placementCounts.get(pk)??999;
            placementCounts.set(pk,Math.min(cur,1)); // near-zero → maximum urgency
          }
        }
      }
    }

    // ── FIX 7: ELONGATED URGENCY OVERRIDE ────────────────────────────────────
    // When AI holds 2+ elongated pieces (I/L/N/Y/Z), strategic scoring for compact
    // pieces (W/F/T/X/V/P) can overwhelm even a +700 MCPF bonus, causing compact
    // pieces to be played first while elongated pieces pile up and strand.
    // Fix (upgraded): Hard pre-filter — if AI holds 2+ elongated pieces and the
    // current MCPF winner is NOT elongated, force the move beam to elongated pieces
    // only (picking the most-constrained elongated piece).
    // Soft fallback: tighten urgency caps so elongated always wins the urgency slot.
    const ELONG_URGENT_SET=['I','L','N','Y','Z'];
    const elongHandNow=aiHand.filter(p=>ELONG_URGENT_SET.includes(p));
    if(elongHandNow.length>=2&&moves.length>1){
      // Find most-constrained elongated piece
      let minElongCnt=Infinity, minElongPk=null;
      for(const pk of elongHandNow){
        const c=placementCounts.get(pk)??999;
        if(c<minElongCnt){minElongCnt=c;minElongPk=pk;}
      }
      // Find most-constrained piece overall (could be compact)
      const allCounts=[...placementCounts.entries()];
      const overallMin=Math.min(...allCounts.map(([,v])=>v));
      const overallMinPk=allCounts.find(([,v])=>v===overallMin)?.[0];
      // Hard filter: if overall winner is compact (non-elongated), force elongated
      if(overallMinPk&&!ELONG_URGENT_SET.includes(overallMinPk)&&minElongPk){
        const filtered=moves.filter(m=>m.pk===minElongPk);
        if(filtered.length) moves=filtered;
      } else {
        // Soft fallback: tighten caps so elongated competes fairly
        // 2 elongated→cap 2, 3+ elongated→cap 1
        const urgentCap=elongHandNow.length>=3?1:2;
        for(const pk of elongHandNow){
          const cur=placementCounts.get(pk)??999;
          placementCounts.set(pk,Math.min(cur,urgentCap));
        }
      }
    }

    // ── FIX 8: MID-GAME ALL-PIECE URGENCY (compact piece stranding prevention) ─
    // Fix 7 guards elongated pieces. But compact pieces (F, W, etc.) can also
    // strand when the board is mid-to-late stage and free space becomes fragmented.
    // When board fill > 40%, compute placement counts for ALL remaining pieces and
    // treat any piece with count < 5 as urgency-boosted in MCPF — ensuring pieces
    // at risk of stranding are played before the board fills their last spots.
    const totalCells=boardW*boardH;
    const occupiedCells=board.flat().filter(c=>c!==null).length;
    if(occupiedCells/totalCells>0.40&&aiHand.length>1){
      for(const [pk,cnt] of placementCounts.entries()){
        if(cnt<5&&cnt>1){ // don't override 0/1 (already handled by hard pre-filter)
          placementCounts.set(pk,Math.min(cnt,2)); // treat as near-constrained
        }
      }
    }

    // Full opportunity scan (all 4 systems active, highest fidelity)
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);

    // Plan with pivot
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,opp);
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;
    const zoneSealed=seal?.isSealed??false;

    // Piece cavity plan (legendary uses exclusive slots aggressively)
    const cavityPlan=buildPieceCavityPlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,PENTOMINOES,transformCells);

    // Opponent cavity detector (more important at legendary — intrude early)
    const oppCavity=detectOpponentCavity(board,boardW,boardH,hp,hpHand,allowFlip,PENTOMINOES,transformCells);

    // ── Fork threat detector ──────────────────────────────────────────────────
    // Detect if opponent's placed pieces border 2+ distinct open zones (fork).
    // Computed once per turn; used in forkCounterBonus per move.
    const forkThreat=detectForkThreat(board,boardW,boardH,hp,hpHand,allowFlip,PENTOMINOES,transformCells);

    // Predict opponent's zone
    const oppSig=_bsig(board,boardW,boardH)+'|opp|'+hpHand.slice().sort().join('');
    if(!_oppZone||_oppZoneSig!==oppSig){
      _oppZone=predictOpponentZone(hpHand,board,boardW,boardH,ap,hp,allowFlip,PENTOMINOES,transformCells);
      _oppZoneSig=oppSig;
    }

    const keyPieces=identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells);
    if(plan) for(const pk of plan.pieces) keyPieces.set(pk,(keyPieces.get(pk)||0)+80);

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const baseBeamL=mw?40:65;
    // Fix 15 — adaptive beam
    const regionCountL=floodFillRegions(board,boardW,boardH).length;
    const adaptiveBeamL=baseBeamL+Math.min(30,Math.max(0,regionCountL-3)*5);
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

      // Territory plan (primary)
      let planBonus=0;
      if(plan){
        let pw=zoneSealed?5:10*dw.earlyBoost;
        if(!zoneSealed&&seal&&seal.progress>0.5) pw*=1.8;
        if(!zoneSealed&&seal&&seal.progress>0.8) pw*=2.5;
        planBonus=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*pw;
      }

      // FULL opportunity scanner at 1.5x weight (Ultimate exploits harder)
      const oppBonus=opportunityBonus(m.abs,opp,board,sim,boardW,boardH,ap,hp,1.5);

      // Opponent zone disruption (Ultimate signature)
      const disrupt=_oppZone?opponentZoneDisruptBonus(m.abs,_oppZone,boardW,boardH)*2.5:0;

      const apBonus=articulationCutBonus(m.abs,board,sim,boardW,boardH,ap,hp,preAPs,regs);
      const splitBonus=boardSplitBonus(m.abs,board,sim,boardW,boardH,ap,hp);
      const sealTerr=territorySealScore(sim,boardW,boardH,ap,hp,regs);
      const shapeRead=dw.progress>(mw?0.35:0.15)
        ?opponentShapeReadScore(sim,boardW,boardH,hp,rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)*aggMult
        :0;

      // Self-shape read: reward territory compatible with own remaining hand (2x weight for Ultimate)
      const selfShapeRead=selfShapeReadScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells);

      // ── HUMAN STRATEGY BONUSES ──────────────────────────────────────────────
      // Strategy 1: P+U exclusive pair territory — when holding P+U, reward
      // moves that build toward a 10-cell zone only those two pieces can tile.
      const pairTerrScore=(aiHand.includes('P')&&aiHand.includes('U'))
        ?pairExclusiveTerritoryScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)
        :0;

      // Strategy 2: 3-piece combo cavity setup — reward moves that (with one
      // follow-up placement) create a 5-cell exclusive cavity for a 3rd piece.
      const comboSetup=aiHand.length>=3
        ?comboCavitySetupBonus(m.abs,m.pk,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells)
        :0;

      // Strategy 3: I-lane fencing — when holding I, reward moves adjacent to
      // the best available I-lane WITHOUT blocking it; penalise stepping on it.
      const iLaneFence=aiHand.includes('I')&&m.pk!=='I'
        ?iLaneFencingBonus(m.abs,m.pk,board,sim,boardW,boardH,aiHand,hpHand,allowFlip,PENTOMINOES,transformCells)
        :0;

      // Strategy 4: Exclusive piece cavity — P-holes, U-holes, 3×2 P+U zones,
      // and any exclusive 5-cell cavity for AI's held pieces. This is the core
      // of the human's "make a hole only I can fill" tactic.
      const excCavity=exclusivePieceCavityBonus(m.abs,m.pk,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],placedCount+1,allowFlip,PENTOMINOES,transformCells);

      // Strategy 5: Fork counter — when opponent's pieces border 2+ open zones,
      // reward moves that occupy the pivot cell(s) connecting those zones, or
      // that speed-seal the smaller threatened zone before opponent claims it.
      const forkCounter=forkThreat.active
        ?forkCounterBonus(m.abs,board,sim,boardW,boardH,ap,hp,forkThreat)
        :0;

      // Strategy 6: Cooperative cavity penalty — penalise moves that frame a
      // region where ONLY the opponent's pieces fit. This is the "AI building
      // walls for human's exclusive hole" bug found in game logs.
      const coopCavPenalty=cooperativeCavityPenalty(m.abs,m.pk,board,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells);

      // Strategy 7: Abandoned zone penalty — penalise moves that leave a large
      // opponent-adjacent zone completely uncontested by the AI. Prevents the
      // "AI plays entirely left while human colonises right" failure mode.
      const abandonedZone=abandonedZonePenalty(m.abs,sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells);

      // ── FIX 3: 3-ply minimax — opponent beam sorted by viability, not just quickScore ──
      // Previously oppScored used only quickScore, missing game-ending moves like an I-sweep
      // that scores modestly on territory but strands all AI elongated pieces.
      // Now we mix in allPiecesViabilityScore so board-shattering moves rise to the top.
      const oppMoves=movesOnBoard(hp,sim,boardW,boardH,rem,placedCount+1,allowFlip);
      let lookahead=0;
      if(oppMoves.length){
        const oppBeam=Math.min(mw?18:45,oppMoves.length);
        const checkOppViab=rem[ap].some(p=>['I','L','N','Y','Z'].includes(p));
        const oppScored=oppMoves.map(om=>{
          const ao=sim.map(r=>[...r]);
          for(const[x,y]of om.abs) ao[y][x]={player:hp,pieceKey:om.pk};
          const qs=quickScore(ao,ap,hp,boardW,boardH);
          // FIX 3: viability component so stranding moves bubble to top of danger beam
          const remAfterOpp={[ap]:[...(rem[ap]||[])],[hp]:(rem[hp]||[]).filter(k=>k!==om.pk)};
          const viab=checkOppViab
            ?allPiecesViabilityScore(ao,boardW,boardH,remAfterOpp[ap],placedCount+2,allowFlip,PENTOMINOES,transformCells)
            :0;
          return{om,s:qs+viab*0.6}; // viab is 0 or large negative → combined score lower = more dangerous
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
              // ── FIX 1: 4th ply — simulate human's response to AI's ply-3 move ──────
              // The 3-ply couldn't see: AI plays Z → human P → AI T → human I (game over).
              // This inner loop evaluates the worst human ply-4 move after AI's ply-3.
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

      // ── FIX 2: I-lane survival penalty ──────────────────────────────────────
      // Penalise moves that leave reachable I-lanes open when opponent holds I.
      // This is a direct cost (not just a reward for closing lanes) so it can
      // override territory/plan scores that otherwise look fine.
      let iLanePenalty=0;
      if(hpHand.includes('I')){
        const lanesAfterMove=countReachableILanes(sim,boardW,boardH);
        const urgency=Math.min(1.0,(aiPC+hpPC)<=8?1.0:0.45);
        // Base penalty per surviving lane
        iLanePenalty=-(lanesAfterMove*85*urgency);
        // Extra penalty if we still hold elongated pieces that I could strand
        if(rem[ap].some(p=>['L','N','Y','Z'].includes(p))){
          iLanePenalty-=(lanesAfterMove*130*urgency);
        }
      }

      let score=
          tAdv*36+mobRed*14+feaRed*32+infB*2.5+sealB*3
         +frontCtrl*2.5+eff*2+lookahead*22-exposure*1.5
         +ownFea*24-oppFea*36
         +openTerritoryBonus(m.abs,sim,boardW,boardH,ap,regs)*2
         +aiClusterPenalty(sim,boardW,boardH,ap)*2.5+blunder
         +apBonus*3+splitBonus*2.5+sealTerr*2+shapeRead*1.8
         +planBonus+oppBonus+disrupt
         +selfShapeRead*2.2
         +cavityFramingBonus(m.abs,cavityPlan,sim,boardW,boardH,ap)*2.5
         +opponentCavityIntrusionBonus(m.abs,oppCavity,boardW)*2.5
         +pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiPC)*3
         +sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*3.5
         +endgameParityScore(sim,boardW,boardH,ap,hp,rem[ap],rem[hp],allowFlip,PENTOMINOES,transformCells)*3.0
         +linearPieceSurvivalPenalty(sim,boardW,boardH,rem[ap],allowFlip,PENTOMINOES,transformCells)*1.0
         +iPieceUrgencyBonus(m.pk,placedCount,boardW,boardH)
         +iEdgePlacementBonus(m.pk,m.abs,boardW,boardH)*2.0
         +(hpHand.includes('I')?iLaneClosingBonus(m.abs,board,sim,boardW,boardH)*2.2:0)
         +iLanePenalty
         +allPiecesViabilityScore(sim,boardW,boardH,rem[ap],placedCount+1,allowFlip,PENTOMINOES,transformCells)*2.0
         +mcpfUrgencyBonus(m.pk,placementCounts)
         +pairTerrScore*1.8
         +comboSetup*1.5
         +iLaneFence*1.2
         +excCavity*2.0
         +forkCounter*2.2
         +coopCavPenalty*2.5
         +abandonedZone*1.8;

      // Aggression amplifier when behind
      if(aggMult>1){
        const aggSig=apBonus+splitBonus+mobRed*3+disrupt+oppBonus*0.5;
        score+=aggSig*(aggMult-1)*10;
      }

      if(score>bScore){bScore=score;best=m;}
      if(_topKList) _topKList.push({m,score}); // collected for god level MCTS
    }
    if(_topKList){
      _topKList.sort((a,b)=>b.score-a.score);
      return _topKList.slice(0,_topKK).map(x=>x.m);
    }
    return best;
  }

  // ════════════════════════════════════════════════════════════════
  //  ULTIMATE (god) — Expert heuristic + MCTS post-filter
  //  Architecture:
  //    1. Run full Expert (legendary) scoring on all candidates
  //    2. Keep top 6 by heuristic score
  //    3. Run 50 random game completions (MCTS) for each candidate
  //    4. Pick by combined score: 40% heuristic rank + 60% MCTS win-rate
  //  This catches deep positional traps that no static heuristic can see.
  //  Draft: proactive elongated cap + 2-ply simulation of human response.
  // ════════════════════════════════════════════════════════════════
  function movesGod(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const aiPC=(remaining[ap]||[]).length,hpPC=(remaining[hp]||[]).length;
    if(aiPC<=3||hpPC<=3) return endgameSolve(moves);

    // ── Step 1: Get top 12 candidates from full expert heuristic ──────────────
    const K=Math.min(12,moves.length);
    const topK=movesLegendary(moves,K);
    if(!topK||!topK.length) return movesLegendary(moves);
    if(topK.length===1) return topK[0];

    // ── Step 2: MCTS win-rate estimation for each candidate ──────────────────
    const godShapes=getGodShapes(PENTOMINOES,transformCells);
    // More rollouts = more accurate win-rate. Scale by game phase AND candidate
    // count. Early game has more branching so we keep per-candidate budget high.
    // Budget: ~600 total rollouts split across K candidates minimum.
    const rollouts=Math.max(50,Math.min(120,Math.floor(720/K)));

    let bestMove=null,bestCombined=-Infinity;
    for(let i=0;i<topK.length;i++){
      const m=topK[i];
      // Heuristic rank score: 1st = 1.0, last = 1/K
      const rankScore=(topK.length-i)/topK.length;
      // MCTS win rate
      const wr=fastMCTS(m,board,boardW,boardH,ap,hp,remaining,placedCount,godShapes,rollouts);
      // Combined: MCTS dominates (catches traps heuristic misses)
      const combined=rankScore*0.35+wr*0.65;
      if(combined>bestCombined){bestCombined=combined;bestMove=m;}
    }

    // ── Step 3: Guaranteed viability post-filter ─────────────────────────────
    // Before returning, verify that the chosen move leaves ALL remaining pieces
    // with at least 1 valid placement. If not, fall back to the best move that
    // does guarantee viability (even if its MCTS score was lower).
    // This catches deep traps that MCTS rollouts still miss occasionally.
    if(bestMove){
      const simCheck=board.map(r=>[...r]);
      for(const[x,y]of bestMove.abs) simCheck[y][x]={player:ap,pieceKey:bestMove.pk};
      const remCheck=(remaining[ap]||[]).filter(k=>k!==bestMove.pk);
      const viab=allPiecesViabilityScore(simCheck,boardW,boardH,remCheck,placedCount+1,allowFlip,PENTOMINOES,transformCells);
      if(viab<-400){
        // Chosen move strands a piece — find best viable alternative from topK
        let safeBest=null,safeCombined=-Infinity;
        for(let i=0;i<topK.length;i++){
          const m=topK[i];
          const sim2=board.map(r=>[...r]);
          for(const[x,y]of m.abs) sim2[y][x]={player:ap,pieceKey:m.pk};
          const rem2=(remaining[ap]||[]).filter(k=>k!==m.pk);
          const v2=allPiecesViabilityScore(sim2,boardW,boardH,rem2,placedCount+1,allowFlip,PENTOMINOES,transformCells);
          if(v2<-400) continue; // also strands pieces — skip
          const rankScore=(topK.length-i)/topK.length;
          const wr=fastMCTS(m,board,boardW,boardH,ap,hp,remaining,placedCount,godShapes,rollouts);
          const combined=rankScore*0.35+wr*0.65;
          if(combined>safeCombined){safeCombined=combined;safeBest=m;}
        }
        if(safeBest) bestMove=safeBest;
        // If ALL topK strand pieces, MCPF emergency: play the most-constrained piece first
        if(!safeBest){
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
    // Apply the same hard cap as legScore — critical to prevent overriding it
    const ELONGATED_LEG=['I','L','N','Y','Z'];
    const elongatedInHand=aiPicks.filter(p=>ELONGATED_LEG.includes(p)).length;
    const COMPACT_LEG=['F','W','V','U','X'];
    const compactInHand=aiPicks.filter(p=>COMPACT_LEG.includes(p)).length;
    const humanHasILeg=hpPicks.includes('I');
    // Build eligible pool — respect hard caps unless no alternative exists
    const eligible=pool.filter(k=>{
      if(ELONGATED_LEG.includes(k)&&elongatedInHand>=2){
        // Only allow if ALL remaining pieces are elongated (forced pick)
        const nonElong=pool.filter(p=>!ELONGATED_LEG.includes(p));
        return nonElong.length===0;
      }
      if(COMPACT_LEG.includes(k)&&compactInHand>=3&&!humanHasILeg){
        const nonComp=pool.filter(p=>!COMPACT_LEG.includes(p));
        return nonComp.length===0;
      }
      return true;
    });
    const candidates=eligible.length?eligible:pool; // fallback if all blocked
    const SHAPE_SC={I:5,L:5,Y:5,N:4,T:4,Z:4,P:3,W:3,F:2,U:2,X:1,V:2};
    let bestPick=null,bScore=-Infinity;
    for(const pick of candidates){
      const hGets=pool.filter(k=>k!==pick);
      const hScore=[...hpPicks,...hGets].reduce((s,k)=>s+(SHAPE_SC[k]||2)-(PIECE_ROLES.BLOCKER.has(k)?1.5:0),0);
      const score=(SHAPE_SC[pick]||2)-hScore*0.8;
      if(score>bScore){bScore=score;bestPick=pick;}
    }
    return bestPick;
  }

  function pickDraftPiece(){
    const pool=[...game.pool]; if(!pool.length) return null;
    const diff=aiDifficulty.value;
    const hp=humanPlayer.value,ap=aiPlayer.value;
    const hpPicks=game.picks[hp]||[],aiPicks=game.picks[ap]||[];

    // ── Snake-draft position awareness ──────────────────────────────
    // The draft follows a 4-pick cycle: [opener, other, other, opener]
    // repeating. Knowing where we are in that cycle tells the AI how
    // many consecutive human picks follow *this* pick before the AI
    // gets another turn — which directly changes the optimal strategy.
    //
    //   humanPicksNext = 2 → human gets two uninterrupted picks next
    //                        → DENY aggressively (they can grab two good pieces)
    //   humanPicksNext = 0 → AI picks again immediately after this
    //                        → be GREEDY (focus on own hand quality)
    const nextIdx      = hpPicks.length + aiPicks.length; // 0-based index of THIS pick
    const cyclePos     = nextIdx % 4;
    const openerIsAI   = (game._draftOpener ?? 1) === ap;
    // Positions where the human gets two consecutive picks next:
    //   opener=AI  → cycle pos 0 (human fills slots 1 & 2)
    //   opener=Hum → cycle pos 2 (human fills slots 3 & 0 of next group)
    const humanPicksNext = (openerIsAI && cyclePos === 0) || (!openerIsAI && cyclePos === 2) ? 2 : 0;
    // Denial multiplier: 1× normal, 1.5× when human gets two free picks
    const denialMult   = humanPicksNext === 2 ? 1.5 : 1.0;
    // Greed multiplier: 1.3× when AI picks again immediately (build freely)
    const greedMult    = humanPicksNext === 0 ? 1.3 : 1.0;

    // Easy: pure random — unaffected by draft position
    if(diff==='easy') return pool[Math.floor(Math.random()*pool.length)];

    // Normal: 50% random, otherwise pick versatile.
    // Slight awareness: when human gets two picks next, prefer stealing versatile pieces.
    if(diff==='normal'){
      if(Math.random() < (humanPicksNext===2 ? 0.25 : 0.5))
        return pool[Math.floor(Math.random()*pool.length)];
      const good=pool.filter(k=>VERSATILE_PIECES.has(k));
      return good.length?good[Math.floor(Math.random()*good.length)]:pool[Math.floor(Math.random()*pool.length)];
    }

    // Hard: synergy-denial + versatile pick, now draft-position aware.
    //   • When human has two picks coming: heavily favour denial over own utility.
    //   • When AI picks again next: allow more greed (tricky/versatile for self).
    if(diff==='hard'){
      const targets=getSynergyTargets(hpPicks,pool);
      const denyChance = Math.min(0.97, 0.85 * denialMult);
      if(targets.length&&Math.random()<denyChance) return targets[Math.floor(Math.random()*targets.length)];
      const good=pool.filter(k=>VERSATILE_PIECES.has(k));
      const versatileChance = Math.min(0.96, 0.80 * greedMult);
      if(good.length&&Math.random()<versatileChance) return good[Math.floor(Math.random()*good.length)];
      const tricky=pool.filter(k=>TRICKY_PIECES.has(k));
      // Only pick tricky pieces for self when greedy (AI picks again next)
      if(tricky.length&&humanPicksNext===0&&Math.random()<0.65) return tricky[Math.floor(Math.random()*tricky.length)];
      return pool[Math.floor(Math.random()*pool.length)];
    }

    // Master: snake-aware scoring. Denial weight scales with denialMult;
    // own-hand quality scales with greedMult.
    if(diff==='master'){
      function gmSnakeScore(k){
        let s = gmDraftScore(k,aiPicks) * greedMult;
        // Deny human synergies — boosted when human gets two picks next
        if(getSynergyTargets(hpPicks,[k]).length) s += 8 * denialMult;
        // Pool-narrowing bonus: does picking k reduce human synergy options?
        const poolAfter=pool.filter(p=>p!==k);
        const synBefore=getSynergyTargets(hpPicks,pool).length;
        const synAfter =getSynergyTargets(hpPicks,poolAfter).length;
        s += (synBefore - synAfter) * 5 * denialMult;
        return s;
      }
      const targets=getSynergyTargets(hpPicks,pool);
      // When human gets two picks next always run the denial path
      if(targets.length && (humanPicksNext===2 || Math.random()<0.9))
        return targets.reduce((b,k)=>gmSnakeScore(k)>gmSnakeScore(b)?k:b,targets[0]);
      const rectFriendly=pool.filter(k=>['I','L','Y','P','N','T','V'].includes(k));
      if(rectFriendly.length&&Math.random()<(0.7*greedMult))
        return rectFriendly.reduce((b,k)=>gmSnakeScore(k)>gmSnakeScore(b)?k:b,rectFriendly[0]);
      return pool.reduce((b,k)=>gmSnakeScore(k)>gmSnakeScore(b)?k:b);
    }

    // Ultimate: full position-aware scoring. legScore gets denial and greed
    // weights directly from the snake cycle position.
    const sp=legendarySmallPool(pool,aiPicks,hpPicks); if(sp) return sp;

    // ── GOD DRAFT (Ultimate difficulty) ──────────────────────────────────────
    // Differences from Expert (legendary) draft:
    //   1. PROACTIVE elongated cap: cap at 1 elongated if pool still contains I
    //      AND 2+ compact pieces, even before the human reveals their strategy.
    //   2. 2-ply simulation: for every pick, simulate the human's best counter-
    //      pick and choose the AI pick that gives the best worst-case hand.
    if(diff==='ultimate'){
      const ELONG_G=['I','L','N','Y','Z'];
      const COMP_G=['F','W','V','U','X'];
      const elongInHand_G=aiPicks.filter(p=>ELONG_G.includes(p)).length;
      const compInHand_G=aiPicks.filter(p=>COMP_G.includes(p)).length;
      const humanHasI_G=hpPicks.includes('I');
      const humanCompact_G=hpPicks.filter(p=>COMP_G.includes(p)).length;
      // Proactive cap: if we already have 1 elongated AND the pool still has I + 2 compact,
      // cap at 1 regardless of what human has picked yet. This prevents the replay-2 disaster.
      const poolHasI_G=pool.includes('I');
      const poolCompact_G=pool.filter(p=>COMP_G.includes(p)).length;
      const proactiveCap=(elongInHand_G>=1&&poolHasI_G&&poolCompact_G>=2)?1:2;
      // Reactive cap (same as legendary): tighten if threat confirmed
      const reactiveCap=(humanHasI_G&&humanCompact_G>=1)?1:2;
      const elongCapG=Math.min(proactiveCap,reactiveCap);

      // Hand quality estimator: returns delta (positive = good for AI)
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
        return score;
      }

      function godDraftScore(pick){
        if(ELONG_G.includes(pick)&&elongInHand_G>=elongCapG){
          if(pool.filter(p=>!ELONG_G.includes(p)).length>0) return -9999;
        }
        if(COMP_G.includes(pick)&&compInHand_G>=3&&!humanHasI_G){
          if(pool.filter(p=>!COMP_G.includes(p)).length>0) return -9999;
        }
        // Base scoring (same as legScore)
        let s=(SHAPE_SCORE[pick]||2)*4*greedMult;
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

        // ── P+U PAIR SYNERGY (human strategy mirror) ─────────────────────────
        // Holding both P and U enables the exclusive 3×2 tiling strategy.
        // Heavily reward completing the pair; also deny the partner if human took one.
        const aiHasP=aiPicks.includes('P'), aiHasU=aiPicks.includes('U');
        const hpHasP=hpPicks.includes('P'), hpHasU=hpPicks.includes('U');
        if(pick==='U'&&aiHasP&&pool.includes('U')) s+=32*greedMult; // completing own pair
        if(pick==='P'&&aiHasU&&pool.includes('P')) s+=32*greedMult;
        if(pick==='U'&&hpHasP&&pool.includes('U')) s+=28*denialMult; // deny their pair
        if(pick==='P'&&hpHasU&&pool.includes('P')) s+=28*denialMult;
        // If neither side has either piece yet and both are in pool, prioritise P slightly
        // (P is more flexible as a 3×2 anchor)
        if(!aiHasP&&!aiHasU&&!hpHasP&&!hpHasU&&(pick==='P'||pick==='U')) s+=10*greedMult;

        // ── CAVITY POTENTIAL BONUS ────────────────────────────────────────────
        // P and U are the best cavity-makers (easy to make exclusive holes).
        // Reward picking them if the opponent can't also make the same shape.
        if((pick==='P'||pick==='U')&&!hpPicks.includes(pick==='P'?'U':'P')) s+=14*greedMult;

        // ── 2-ply: simulate best human counter-pick ─────────────────────────
        const projAI=[...aiPicks,pick];
        const poolAfterMe=pool.filter(k=>k!==pick);
        let worstOutcome=0;
        if(poolAfterMe.length>0){
          let worstDelta=Infinity;
          for(const hpick of poolAfterMe){
            const projHP=[...hpPicks,hpick];
            const delta=evalHand(projAI,projHP); // from AI's perspective
            if(delta<worstDelta){worstDelta=delta;worstOutcome=delta;}
          }
          s+=worstOutcome*0.45; // blend 2-ply worst-case into score
        }
        return s;
      }

      const godElig=pool.filter(k=>{
        if(ELONG_G.includes(k)&&elongInHand_G>=elongCapG)
          return pool.filter(p=>!ELONG_G.includes(p)).length===0;
        if(COMP_G.includes(k)&&compInHand_G>=3&&!humanHasI_G)
          return pool.filter(p=>!COMP_G.includes(p)).length===0;
        return true;
      });
      const godPool=godElig.length?godElig:pool;
      return godPool.reduce((b,k)=>godDraftScore(k)>godDraftScore(b)?k:b,godPool[0]);
    }

    // Expert (legendary): full position-aware scoring
    const draftHistory=_getDraftHistory();
    const freq={};
    for(const e of draftHistory) for(const pk of(e.humanPicks||[])) freq[pk]=(freq[pk]||0)+1;
    const maxF=Math.max(1,...Object.values(freq));
    const hTargetsBefore=getSynergyTargets(hpPicks,pool).length;
    const humanHasI=hpPicks.includes('I');

    // ── PROACTIVE ELONGATED CAP (mirrored from god level) ──────────────────────
    // If we already hold 1+ elongated piece AND the pool still has I + 2 compact
    // pieces available for the human, cap at 1 elongated regardless. This prevents
    // drafting L+N before human reveals I — the root cause of game-1 loss.
    const ELONG_LEG_PRE=['I','L','N','Y','Z'];
    const COMP_LEG_PRE=['F','W','V','U','X'];
    const elongInHandLeg=aiPicks.filter(p=>ELONG_LEG_PRE.includes(p)).length;
    const poolHasI_Leg=pool.includes('I');
    const poolCompact_Leg=pool.filter(p=>COMP_LEG_PRE.includes(p)).length;
    const humanCompact_Leg=hpPicks.filter(p=>COMP_LEG_PRE.includes(p)).length;
    // Proactive: cap = 1 if we have 1 elongated AND pool still has I AND 2+ compact for human
    const proactiveCapLeg=(elongInHandLeg>=1&&poolHasI_Leg&&poolCompact_Leg>=2)?1:2;
    // Reactive: cap = 1 if human already has I + a compact piece
    const reactiveCapLeg=(humanHasI&&humanCompact_Leg>=1)?1:2;
    const elongCapLeg=Math.min(proactiveCapLeg,reactiveCapLeg);

    function legScore(pick){
      // ── HARD LIMITS — applied before any scoring ──────────────────────────
      // These are non-negotiable constraints to prevent unplayable hands.
      const ELONGATED_SET=['I','L','N','Y','Z'];
      const elongatedInHand=aiPicks.filter(p=>ELONGATED_SET.includes(p)).length;
      // Declare humanHasI at the top so all code below (including Fix 5) can use it
      const humanHasI=hpPicks.includes('I');

      // HARD CAP: use the tighter proactive/reactive cap computed above.
      // elongCapLeg = 1 when the pool still has I + 2 compact (proactive threat),
      // or when human already has I + compact (reactive confirmation).
      if(ELONGATED_SET.includes(pick)&&elongatedInHand>=elongCapLeg) return -9999;

      // HARD CAP: avoid drafting 3rd blocker/compact piece for own hand.
      // These are "space fillers" that compete for the same corner/pocket slots.
      const COMPACT_SET=['F','W','V','U','X'];
      const compactInHand=aiPicks.filter(p=>COMPACT_SET.includes(p)).length;
      if(COMPACT_SET.includes(pick)&&compactInHand>=3&&!humanHasI) return -9999;

      // Self-utility (scaled by greed: up to 1.3× when AI picks again next)
      let s=(SHAPE_SCORE[pick]||2) * 4 * greedMult;
      // Human synergy: does this piece pair with what the human already has?
      for(const hk of hpPicks) if((SYNERGY_PAIRS[hk]||[]).includes(pick)) s += 16 * denialMult;
      // Pool narrowing: does grabbing this reduce future human synergy options?
      const poolAfter=pool.filter(k=>k!==pick);
      s += (hTargetsBefore-getSynergyTargets(hpPicks,poolAfter).length) * 6 * denialMult;
      // History: human tends to pick this piece → deny it
      const hw=Math.min(1,draftHistory.length/5);
      s += ((freq[pick]||0)/maxF) * 20 * hw * denialMult;
      // Role diversity for own hand (scaled by greed)
      if(!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p))&&PIECE_ROLES.FLEXIBLE.has(pick)) s += 7 * greedMult;
      if(!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))&&PIECE_ROLES.LINEAR.has(pick))     s += 9 * greedMult;
      if(!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))&&PIECE_ROLES.FILLER.has(pick))     s += 5 * greedMult;
      const bl=aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
      if(PIECE_ROLES.BLOCKER.has(pick)&&bl>=1) s-=8;
      if(PIECE_ROLES.BLOCKER.has(pick)&&aiPicks.length<3) s-=5;
      if(['I','L','Y','P','N'].includes(pick)) s+=5;
      if(VERSATILE_PIECES.has(pick)) s+=4;
      if(UNPAIRABLE.has(pick)) s-=6;
      // ── I-piece fragmentation penalty ──────────────────────────────────────
      // Each compact piece the human picks (F,W,V,U,X) = more board fragmentation
      // = harder for I to find an open 5-in-a-row lane later. Reduce I's value.
      const humanCompactCount=hpPicks.filter(p=>['F','W','V','U','X'].includes(p)).length;
      if(pick==='I') s-=humanCompactCount*7;
      // ── Human-I counter ────────────────────────────────────────────────────
      // If the human ALREADY HAS I in their hand, they're going to use it to
      // sweep a row. Deny them the compact pieces (F,X,W,U) that help fragment
      // the board around the I lane. Also reward AI picking row-blockers (T,X,F,W).
      // (humanHasI declared at top of legScore)
      if(humanHasI){
        // Deny human's remaining compact toolkit aggressively
        if(['F','X','W','U'].includes(pick)) s+=22*denialMult;
        // Row-blocker pieces for AI: T can cut across rows, X is a plus-blocker
        if(['T','X'].includes(pick)) s+=12*greedMult;
      }
      // ── Compact piece denial ────────────────────────────────────────────────
      // If the human is loading up on compact pieces, they're setting up the
      // "fragment and trap" strategy. Deny the remaining compact pieces aggressively.
      if(['F','W','V','U','X'].includes(pick)&&humanCompactCount>=2) s+=22*denialMult;
      // Counter-picks based on human's existing hand shape
      if(hpPicks.some(k=>['I','L','Y','N'].includes(k))&&['T','F','X','W','U'].includes(pick)) s += 3 * denialMult;
      if(hpPicks.some(k=>['T','F','Y','X'].includes(k))&&['I','L','P'].includes(pick))         s += 4 * denialMult;

      // ── P+U PAIR SYNERGY (human strategy mirror) ─────────────────────────
      const aiHasP_L=aiPicks.includes('P'), aiHasU_L=aiPicks.includes('U');
      const hpHasP_L=hpPicks.includes('P'), hpHasU_L=hpPicks.includes('U');
      if(pick==='U'&&aiHasP_L&&pool.includes('U')) s+=32*greedMult;
      if(pick==='P'&&aiHasU_L&&pool.includes('P')) s+=32*greedMult;
      if(pick==='U'&&hpHasP_L&&pool.includes('U')) s+=28*denialMult;
      if(pick==='P'&&hpHasU_L&&pool.includes('P')) s+=28*denialMult;
      if(!aiHasP_L&&!aiHasU_L&&!hpHasP_L&&!hpHasU_L&&(pick==='P'||pick==='U')) s+=10*greedMult;
      if((pick==='P'||pick==='U')&&!hpPicks.includes(pick==='P'?'U':'P')) s+=14*greedMult;

      return s;
    }
    // Pre-filter: remove hard-blocked pieces before running legScore reduce.
    // legScore already returns -9999 for blocked pieces, but this ensures
    // the reduce can't accidentally pick one if all scores are equally terrible.
    const ELONGATED_PRE=['I','L','N','Y','Z'];
    const COMPACT_PRE=['F','W','V','U','X'];
    const elongatedInHandNow=aiPicks.filter(p=>ELONGATED_PRE.includes(p)).length;
    const compactInHandNow=aiPicks.filter(p=>COMPACT_PRE.includes(p)).length;
    // Use the same elongCapLeg computed above (proactive + reactive combined)
    const humanCompactNow=hpPicks.filter(p=>['F','W','V','U','X'].includes(p)).length;
    const eligiblePool=pool.filter(k=>{
      if(ELONGATED_PRE.includes(k)&&elongatedInHandNow>=elongCapLeg){
        return pool.filter(p=>!ELONGATED_PRE.includes(p)).length===0; // allow only if forced
      }
      if(COMPACT_PRE.includes(k)&&compactInHandNow>=3&&!humanHasI){
        return pool.filter(p=>!COMPACT_PRE.includes(p)).length===0;
      }
      return true;
    });
    const scoringPool=eligiblePool.length?eligiblePool:pool;
    return scoringPool.reduce((b,k)=>legScore(k)>legScore(b)?k:b,scoringPool[0]);
  }

  function choosePlacement(moves){
    const diff=aiDifficulty.value;
    if(diff==='easy')      return movesEasy(moves);
    if(diff==='normal')       return movesNormal(moves);
    if(diff==='hard')   return movesTactician(moves);
    if(diff==='master') return movesGrandmaster(moves);
    if(diff==='ultimate')         return movesGod(moves);
    return movesLegendary(moves);
  }

  function thinkDelay(){
    const diff=aiDifficulty.value;
    const placed=game.placedCount||0;
    const rem=Math.min((game.remaining?.[aiPlayer.value]?.length||6),(game.remaining?.[humanPlayer.value]?.length||6));
    if(game.phase==='draft') return 900+Math.random()*400;

    // Fix 16 — scale end-game delay by difficulty so each tier still feels distinct.
    if(rem<=3){
      const base={easy:200,normal:300,hard:450,master:600,expert:750,ultimate:900};
      return (base[diff]||450)+Math.random()*200;
    }
    if(rem<=5){
      const base={easy:350,normal:500,hard:650,master:800,expert:950,ultimate:1100};
      return (base[diff]||650)+Math.random()*300;
    }

    if(diff==='easy')      return 900+Math.random()*900;
    if(diff==='normal')       return 550+Math.random()*600;
    if(diff==='hard')   return 750+Math.random()*500;
    if(diff==='master') return 950+Math.random()*600;
    if(diff==='ultimate'){
      // God is slower due to MCTS — feel the weight of its thinking
      if(placed<=2) return 2200+Math.random()*800;
      if(placed<=5) return 1800+Math.random()*600;
      return 1500+Math.random()*500;
    }
    // legendary (expert) mid-game
    if(placed<=2) return 1500+Math.random()*500;
    if(placed<=5) return 1200+Math.random()*400;
    return 1050+Math.random()*400;
  }

  return{getAllValidMoves,pickDraftPiece,choosePlacement,thinkDelay};
}
