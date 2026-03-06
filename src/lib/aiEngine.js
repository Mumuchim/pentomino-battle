/**
 * PentoBattle AI Engine v3.1 — TERRITORY PLANNER + OPPORTUNITY SCANNER
 *
 * Difficulty map (internal → UI):
 *   dumbie      → Easy
 *   elite       → Normal
 *   tactician   → Hard
 *   grandmaster → Master
 *   legendary   → Ultimate
 *
 * Power hierarchy:
 *   Easy    — 80% random, no planning
 *   Normal  — Voronoi territory only, weak pressure
 *   Hard    — Territory plan + basic mistake detection
 *   Master  — Full opportunity scanner, plan pivoting, 3-ply minimax
 *   Ultimate— Everything + stranded exploitation + opponent disruption
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

function canTileZone(cells,hand,allowFlip,PENTS,xformFn,timeLimitMs=40){
  if(!cells.length||cells.length%5!==0) return{canTile:false,pieces:[]};
  const needed=cells.length/5;
  if(needed>hand.length) return{canTile:false,pieces:[]};
  const coordSet=new Set(cells.map(([x,y])=>y*1000+x));
  const sorted=cells.slice().sort((a,b)=>a[1]*1000+a[0]-(b[1]*1000+b[0]));
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
    const r=canTileZone(zone.cells,hand,allowFlip,PENTS,xformFn,25);
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
    const useRes=(diff==='legendary'||diff==='grandmaster')&&aiHand.length>3;
    const keyPieces=useRes?identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells):null;
    const plan=_plan;
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
      let score=(aiC-hpC)*22+regionFeasibilityBonus(regions,sim,boardW,boardH,hp)*1.6
              +territoryAdvantage(sim,boardW,boardH,ap,hp)*8+aiClusterPenalty(sim,boardW,boardH,ap)*1.5
              +sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*4
              +territorySealScore(sim,boardW,boardH,ap,hp)*2.5
              +zoneSealBonus(regions,board,sim,boardW,boardH,hp)*2.5;
      if(plan) score+=territoryPlanBonus(m.abs,plan,board,sim,boardW,boardH,ap,hp)*3;
      if(keyPieces) score+=pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiHand.length)*1.2;
      if(diff==='legendary'||diff==='grandmaster'){
        const ra={[ap]:aiHand.filter(k=>k!==m.pk),[hp]:[...(remaining[hp]||[])]};
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
    if((remaining[ap]?.length||0)<=5||(remaining[hp]?.length||0)<=5) return endgameSolve(moves);

    const aiHand=remaining[ap]||[];
    // Scan opportunities at reduced fidelity (no pivot)
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,null); // no pivot for Hard
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const beam=connectivityBeam(moves,board,boardW,boardH,ap,hp,isMirrorWar(boardW,boardH)?18:30);

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
    if(aiPC<=( mw?10:8)||hpPC<=(mw?10:8)) return endgameSolve(moves);

    const dw=getDynamicWeights(board,boardW,boardH,ap,hp,placedCount,totalPieces);
    const aiHand=remaining[ap]||[];

    // Scan ALL opportunities first (all 4 systems)
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);

    // Plan WITH pivot: Master will switch if a better zone appears
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,opp);
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;
    const zoneSealed=seal?.isSealed??false;

    const keyPieces=identifyKeyPieces(aiHand,board,boardW,boardH,ap,allowFlip,PENTOMINOES,transformCells);
    if(plan) for(const pk of plan.pieces) keyPieces.set(pk,(keyPieces.get(pk)||0)+60);

    const oppMobBefore=countTotalMoves(board,boardW,boardH,hp,remaining,placedCount,allowFlip);
    const oppFeaBefore=countFeasiblePieces(board,boardW,boardH,hp,remaining,placedCount,allowFlip);

    const beam=connectivityBeam(moves,board,boardW,boardH,ap,hp,mw?35:55);
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

      score+=pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiPC)*2;
      score+=sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*2.5;

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
          const fMoves=movesOnBoard(ap,wBoard,boardW,boardH,wRem,placedCount+2,allowFlip);
          if(fMoves.length){
            const fBeam=Math.min(mw?14:28,fMoves.length);
            let bFollow=-Infinity;
            for(const fm of fMoves.slice(0,fBeam)){
              const af=wBoard.map(r=>[...r]);
              for(const[x,y]of fm.abs) af[y][x]={player:ap,pieceKey:fm.pk};
              const s=quickScore(af,ap,hp,boardW,boardH);
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
  //  ULTIMATE (legendary) — Everything + stranded exploitation
  //  + opponent zone disruption + history draft + widest beam
  //  opportunityBonus at 1.5x weight (stranded & pivot fully active).
  //  Blunder prevention. Adaptive aggression.
  // ════════════════════════════════════════════════════════════════
  function movesLegendary(moves){
    if(!moves.length) return null;
    const{board,boardW,boardH,remaining,placedCount,allowFlip}=game;
    const ap=aiPlayer.value,hp=humanPlayer.value;
    const aiPC=(remaining[ap]||[]).length,hpPC=(remaining[hp]||[]).length;
    const totalPieces=aiPC+hpPC;
    const mw=isMirrorWar(boardW,boardH);
    if(aiPC<=(mw?11:9)||hpPC<=(mw?11:9)) return endgameSolve(moves);

    const dw=getDynamicWeights(board,boardW,boardH,ap,hp,placedCount,totalPieces);
    const aggMult=Math.max(1,dw.aggression);
    const aiHand=remaining[ap]||[];
    const hpHand=remaining[hp]||[];

    // Full opportunity scan (all 4 systems active, highest fidelity)
    const opp=getOrScanOpportunities(board,boardW,boardH,ap,hp,aiHand,allowFlip);

    // Plan with pivot
    const plan=getOrComputePlan(aiHand,board,boardW,boardH,ap,hp,allowFlip,opp);
    const seal=plan?getZoneSealProgress(plan,board,boardW,boardH,ap):null;
    const zoneSealed=seal?.isSealed??false;

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

    const beam=connectivityBeam(moves,board,boardW,boardH,ap,hp,mw?40:65);
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

      // 3-ply minimax
      const oppMoves=movesOnBoard(hp,sim,boardW,boardH,rem,placedCount+1,allowFlip);
      let lookahead=0;
      if(oppMoves.length){
        const oppBeam=Math.min(mw?16:38,oppMoves.length);
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
          const fMoves=movesOnBoard(ap,wBoard,boardW,boardH,wRem,placedCount+2,allowFlip);
          if(fMoves.length){
            const fBeam=Math.min(mw?16:38,fMoves.length);
            let bF=-Infinity;
            for(const fm of fMoves.slice(0,fBeam)){
              const af=wBoard.map(r=>[...r]);
              for(const[x,y]of fm.abs) af[y][x]={player:ap,pieceKey:fm.pk};
              const s=quickScore(af,ap,hp,boardW,boardH);
              if(s>bF) bF=s;
            }
            lookahead=(bF+wS)*0.5;
          } else lookahead=wS;
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
         +pieceReservationPenalty(m.pk,aiHand,keyPieces,placedCount,aiPC)*3
         +sealingFinisherBonus(m.abs,board,sim,boardW,boardH,ap,hp)*3.5;

      // Aggression amplifier when behind
      if(aggMult>1){
        const aggSig=apBonus+splitBonus+mobRed*3+disrupt+oppBonus*0.5;
        score+=aggSig*(aggMult-1)*10;
      }

      if(score>bScore){bScore=score;best=m;}
    }
    return best;
  }

  // ─────────────────────────────────────────────────────────────
  //  DRAFT PICKER
  // ─────────────────────────────────────────────────────────────
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
    let bestPick=null,bScore=-Infinity;
    for(const pick of pool){
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

    // Easy: pure random
    if(diff==='dumbie') return pool[Math.floor(Math.random()*pool.length)];

    // Normal: 50% random, otherwise pick versatile
    if(diff==='elite'){
      if(Math.random()<0.5) return pool[Math.floor(Math.random()*pool.length)];
      const good=pool.filter(k=>VERSATILE_PIECES.has(k));
      return good.length?good[Math.floor(Math.random()*good.length)]:pool[Math.floor(Math.random()*pool.length)];
    }

    // Hard: deny synergies, prefer versatile, occasionally trick pieces
    if(diff==='tactician'){
      const targets=getSynergyTargets(hpPicks,pool);
      if(targets.length&&Math.random()<0.85) return targets[Math.floor(Math.random()*targets.length)];
      const good=pool.filter(k=>VERSATILE_PIECES.has(k));
      if(good.length&&Math.random()<0.80) return good[Math.floor(Math.random()*good.length)];
      const tricky=pool.filter(k=>TRICKY_PIECES.has(k));
      if(tricky.length&&Math.random()<0.55) return tricky[Math.floor(Math.random()*tricky.length)];
      return pool[Math.floor(Math.random()*pool.length)];
    }

    // Master: deny synergies first, then prefer rect-zone friendly pieces
    if(diff==='grandmaster'){
      const targets=getSynergyTargets(hpPicks,pool);
      if(targets.length) return targets.reduce((b,k)=>gmDraftScore(k,aiPicks)>gmDraftScore(b,aiPicks)?k:b,targets[0]);
      const rectFriendly=pool.filter(k=>['I','L','Y','P','N','T','V'].includes(k));
      if(rectFriendly.length&&Math.random()<0.7)
        return rectFriendly.reduce((b,k)=>gmDraftScore(k,aiPicks)>gmDraftScore(b,aiPicks)?k:b,rectFriendly[0]);
      return pool.reduce((b,k)=>gmDraftScore(k,aiPicks)>gmDraftScore(b,aiPicks)?k:b);
    }

    // Ultimate: history-aware, deny synergies, zone-building bias
    const sp=legendarySmallPool(pool,aiPicks,hpPicks); if(sp) return sp;
    const draftHistory=_getDraftHistory();
    const freq={};
    for(const e of draftHistory) for(const pk of(e.humanPicks||[])) freq[pk]=(freq[pk]||0)+1;
    const maxF=Math.max(1,...Object.values(freq));
    const hTargetsBefore=getSynergyTargets(hpPicks,pool).length;

    function legScore(pick){
      let s=(SHAPE_SCORE[pick]||2)*4;
      for(const hk of hpPicks) if((SYNERGY_PAIRS[hk]||[]).includes(pick)) s+=16;
      const poolAfter=pool.filter(k=>k!==pick);
      s+=(hTargetsBefore-getSynergyTargets(hpPicks,poolAfter).length)*6;
      const hw=Math.min(1,draftHistory.length/5);
      s+=((freq[pick]||0)/maxF)*20*hw;
      if(!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p))&&PIECE_ROLES.FLEXIBLE.has(pick)) s+=7;
      if(!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))&&PIECE_ROLES.LINEAR.has(pick))     s+=9;
      if(!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))&&PIECE_ROLES.FILLER.has(pick))     s+=5;
      const bl=aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
      if(PIECE_ROLES.BLOCKER.has(pick)&&bl>=1) s-=8;
      if(PIECE_ROLES.BLOCKER.has(pick)&&aiPicks.length<3) s-=5;
      if(['I','L','Y','P','N'].includes(pick)) s+=5;
      if(VERSATILE_PIECES.has(pick)) s+=4;
      if(UNPAIRABLE.has(pick)) s-=6;
      if(hpPicks.some(k=>['I','L','Y','N'].includes(k))&&['T','F','X','W','U'].includes(pick)) s+=3;
      if(hpPicks.some(k=>['T','F','Y','X'].includes(k))&&['I','L','P'].includes(pick))         s+=4;
      return s;
    }
    return pool.reduce((b,k)=>legScore(k)>legScore(b)?k:b,pool[0]);
  }

  function choosePlacement(moves){
    const diff=aiDifficulty.value;
    if(diff==='dumbie')      return movesEasy(moves);
    if(diff==='elite')       return movesNormal(moves);
    if(diff==='tactician')   return movesTactician(moves);
    if(diff==='grandmaster') return movesGrandmaster(moves);
    return movesLegendary(moves);
  }

  function thinkDelay(){
    const diff=aiDifficulty.value;
    if(diff==='dumbie')      return 900+Math.random()*900;
    if(diff==='elite')       return 550+Math.random()*600;
    if(diff==='tactician')   return 750+Math.random()*500;
    if(diff==='grandmaster') return 950+Math.random()*600;
    const placed=game.placedCount||0;
    const rem=Math.min((game.remaining?.[aiPlayer.value]?.length||6),(game.remaining?.[humanPlayer.value]?.length||6));
    if(game.phase==='draft') return 900+Math.random()*400;
    if(rem<=3) return 450+Math.random()*300;
    if(rem<=5) return 750+Math.random()*400;
    if(placed<=2) return 1500+Math.random()*500;
    if(placed<=5) return 1200+Math.random()*400;
    return 1050+Math.random()*400;
  }

  return{getAllValidMoves,pickDraftPiece,choosePlacement,thinkDelay};
}
