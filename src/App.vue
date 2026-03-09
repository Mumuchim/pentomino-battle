<template>
  <div ref="appRoot" class="app" :class="{ inGame: isInGame, hasBottomBar: showBottomBar, tetMode: showMenuChrome }">
    <!-- 🔥 Animated RGB background -->
    <div class="bg">
      <div class="bgGradient"></div>
      <div class="bgNoise"></div>
      <div class="bgGlow g1"></div>
      <div class="bgGlow g2"></div>
      <div class="bgGlow g3"></div>
    </div>

    <!-- 🎮 Floating pentomino ambient layer (transparent-bg menu screens) -->
    <div v-if="isMenuScreen && !['landing','auth','mode','multiplayer','solo','story'].includes(screen)" class="menuPentoBg" aria-hidden="true">
      <div
        v-for="(piece, i) in bouncingPieces"
        :key="'mp' + i"
        class="floatingPieceWrap"
        :style="{ left: piece.x + 'px', top: piece.y + 'px' }"
      >
        <svg
          :width="piece.svgW"
          :height="piece.svgH"
          :viewBox="`0 0 ${piece.svgW} ${piece.svgH}`"
          :style="{ opacity: piece.opacity }"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            v-for="(cell, j) in piece.cells"
            :key="j"
            :x="cell[1] * 42 + 1"
            :y="cell[0] * 42 + 1"
            :width="40"
            :height="40"
            :fill="piece.color"
            rx="6"
          />
        </svg>
      </div>
    </div>

    <!-- ✅ Turn border (only during game) -->
    <div
      v-if="isInGame"
      class="turnFrame"
      :class="{
        p1: game.phase !== 'gameover' && game.currentPlayer === 1,
        p2: game.phase !== 'gameover' && game.currentPlayer === 2,
        end: game.phase === 'gameover',
      }"
      aria-hidden="true"
    ></div>

    <!-- ⚙ Dev mode overlay (only renders for dev-role accounts) -->
    <DevOverlay v-if="isDevUser" :ai-difficulty="aiDifficulty" :ai-player="aiPlayer" />

    <!-- ⚙ Dev mode toggle button (only visible to dev users, during battle) -->
    <button
      v-if="isDevUser && isInGame"
      class="dev-toggle-btn"
      :class="{ active: devModeActive }"
      @click="toggleDevMode"
      title="Toggle Dev Mode"
    >⚙ DEV</button>

    <!-- ✅ Full-screen interaction lock + loading (prevents "loaded but not visible" desync clicks) -->
    <div v-if="uiLock.active" class="loadOverlay" aria-live="polite" aria-busy="true">
      <div class="loadCard">
        <div class="loadTop">
          <img :src="menuLogoUrl" class="loadLogo" alt="" />
          <div class="loadText">
            <img :src="menuTitleUrl" class="loadTitlePng floatingLogo" alt="Pento Battle" />
            <div class="loadSub">{{ uiLock.label }}</div>
          </div>
        </div>

        <div
          class="loadBar"
          role="progressbar"
          :aria-valuenow="Math.round(uiLock.progress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="loadBarFill" :style="{ width: Math.round(uiLock.progress * 100) + '%' }"></div>
        </div>

        <div class="loadHint">{{ uiLock.hint }}</div>
      </div>
    </div>

    <!-- 📱 Landscape lock overlay (optional) -->
    <div v-if="landscapeLockActive" class="rotateOverlay" aria-live="polite" aria-busy="true">
      <div class="rotateCard">
        <div class="rotateTitle">Rotate your device</div>
        <div class="rotateSub">This match is locked to <b>landscape</b>.</div>
      </div>
    </div>

    <!-- 📱 Soft portrait suggestion (non-blocking, mobile only, dismissable) -->
    <Transition name="portraitHint">
      <div
        v-if="portraitSuggestionVisible"
        class="portraitHint"
        role="status"
        aria-live="polite"
      >
        <span class="portraitHintIcon">📱↻</span>
        <span class="portraitHintText">Rotate to landscape for the best experience</span>
        <button class="portraitHintDismiss" tabindex="-1" @click="dismissPortraitHint">✕</button>
      </div>
    </Transition>

    <header v-if="screen !== 'landing'" class="topbar" :class="{ tetBar: showMenuChrome, hpTopbar: screen === 'auth', mnTopbar: ['mode','multiplayer','solo'].includes(screen), vsaiTopbarBar: screen === 'story', stTopbar: ['settings','credits'].includes(screen), lbTopbar: screen === 'lobby' }" :style="screen === 'auth' ? { '--hp-topbar-img': `url(${hpAuthTopbarUrl})` } : screen === 'mode' ? { '--mn-topbar-img': `url(${menuTopbarUrl})` } : screen === 'multiplayer' ? { '--mn-topbar-img': `url(${mpTopbarUrl})` } : screen === 'solo' ? { '--mn-topbar-img': `url(${soloTopbarUrl})` } : screen === 'story' ? { '--vsai-topbar-img': `url(${vsaiTopbarUrl})` } : screen === 'settings' ? { '--st-topbar-img': `url(${settingsTopbarUrl})` } : screen === 'credits' ? { '--st-topbar-img': `url(${creditsTopbarUrl})` } : screen === 'lobby' ? { '--lb-topbar-img': `url(${lobbyTopbarNewUrl})` } : {}">
      <!-- TETR.IO-style menu top bar -->
      <template v-if="showMenuChrome">
        <div class="tetBarLeft">
          <!-- Back button (text style like TETR.IO) -->
          <button v-if="canGoBack && !['settings','credits','lobby'].includes(screen)" class="tetBackBtn" @click="goBack" aria-label="Back">BACK</button>
          <!-- Page title: PNG asset for screens that have title images -->
          <img v-if="screen === 'settings'" :src="settingsTextUrl" class="tetBarTitlePng" alt="SETTINGS" />
          <img v-else-if="screen === 'credits'" :src="creditsTextUrl" class="tetBarTitlePng" alt="CREDITS" />
          <img v-else-if="screen === 'lobby'" :src="lobbyTextUrl" class="tetBarTitlePng" alt="LOBBY" />
          <div v-else class="tetBarTitle">{{ topPageTitle }}</div>
        </div>

        <div class="tetBarRight" v-if="screen !== 'auth'">

          <!-- ── Social icons: Friends + Notifications (logged-in only) ── -->
          <template v-if="loggedIn">
          <button
            class="tetBarIconBtn"
            :class="{ active: friendsSidebarOpen }"
            @click="toggleFriendsSidebar"
            title="Friends"
            aria-label="Friends"
          >
            <!-- friends group icon (SVG) -->
            <svg class="tetBarIconSvg" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="5" r="3.5" stroke="currentColor" stroke-width="1.6"/>
              <path d="M1 17c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="16" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M19 17c0-2.761-1.343-5.212-3.4-6.708" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span class="tetBarIconCount" v-if="friendsOnlineCount > 0">{{ friendsOnlineCount }}</span>
            <span class="tetBarIconCount zero" v-else>0</span>
          </button>

          <button
            class="tetBarIconBtn"
            :class="{ active: notifSidebarOpen }"
            @click="toggleNotifSidebar"
            title="Notifications"
            aria-label="Notifications"
          >
            <!-- bell icon (SVG) -->
            <svg class="tetBarIconSvg" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2a6 6 0 0 0-6 6v4l-2 2v1h16v-1l-2-2V8a6 6 0 0 0-6-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="M8 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <span class="tetBarNotifDot" v-if="unreadNotifCount > 0"></span>
          </button>
          </template>

          <!-- ── User block: avatar + name + rank ── -->
          <div
            class="tetBarUser"
            :class="{ tetBarUserMember: loggedIn }"
            @click="loggedIn ? openProfileModal() : openAuthModal('login')"
            title="View profile"
          >
            <div class="tetBarAvatarWrap">
              <img :src="guestAvatarUrl" class="tetBarAvatar" alt="Profile" />
              <span v-if="loggedIn" class="tetBarOnlineDot"></span>
            </div>
            <div class="tetBarIgn">
              <span class="tetBarIgnName">{{ displayName }}</span>
            </div>
          </div>

        </div>
</template>

      <!-- Original game top bar (in-game) -->
      <template v-else>
        <div class="brand" @click="goAuth" title="Back to Main Menu">
          <div class="logoMark">
            <img :src="menuLogoUrl" alt="Logo" class="logoImg floatingLogo" />
          </div>
          <div class="brandText">
            <img :src="menuTitleUrl" class="brandTitlePng floatingLogo" alt="Pento Battle" />
          </div>
        </div>

        <div class="right">
          <img :src="guestAvatarUrl" class="topAvatar" alt="Profile" />
          <!-- In-game settings (Esc) -->
          <button
            class="btn ghost"
            v-if="isInGame"
            @click="openInGameSettings"
            aria-label="Settings"
            title="Settings (Esc)"
          >⚙</button>

          <button class="btn ghost" v-if="canGoBack" @click="goBack" aria-label="Back">BACK</button>
          <button class="btn ghost" v-if="screen !== 'auth'" @click="goAuth" aria-label="Main Menu">MENU</button>

          <!-- Couch Play / AI Mode: Undo last placement (local only) -->
          <button
            class="btn ghost"
            v-if="screen === 'couch' || screen === 'puzzle'"
            :disabled="!canUndo"
            @click="doUndo"
            aria-label="Undo"
            title="Undo"
          >UNDO</button>
          <button class="btn" v-if="isInGame" @click="onPrimaryMatchAction">{{ primaryMatchActionLabel }}</button>
        </div>
      </template>
    </header>

    <main class="main">
    <div class="pageWrap">

      <!-- ══════════════════════════════════════════════════════════
           LANDING  (pre-auth splash screen with floating pentominoes)
      ═══════════════════════════════════════════════════════════ -->
      <section v-if="screen === 'landing'" class="landingScreen">
        <!-- Floating pentomino background -->
        <div class="landingBg" aria-hidden="true">
          <div
            v-for="(piece, i) in bouncingPieces"
            :key="i"
            class="floatingPieceWrap"
            :style="{ left: piece.x + 'px', top: piece.y + 'px' }"
          >
            <svg
              :width="piece.svgW"
              :height="piece.svgH"
              :viewBox="`0 0 ${piece.svgW} ${piece.svgH}`"
              :style="{ opacity: piece.opacity }"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                v-for="(cell, j) in piece.cells"
                :key="j"
                :x="cell[1] * 42 + 1"
                :y="cell[0] * 42 + 1"
                :width="40"
                :height="40"
                :fill="piece.color"
                rx="6"
              />
            </svg>
          </div>
        </div>

        <!-- Center content -->
        <div class="landingCenter">
          <img :src="hpLogoUrl" class="landingLogo" alt="Logo" />
          <img :src="hpTitleUrl" class="landingTitle" alt="PENTObattle" />
          <img :src="hpAuthorUrl" class="landingAuthor" alt="Developed by MUMUCHXM" />
          <button class="landingStartBtn" @click="navTo('auth')">
            <span class="landingStartBtnText">CLICK START</span>
          </button>
        </div>

        <!-- Vignette overlay -->
        <div class="landingVignette" aria-hidden="true"></div>
      </section>

      <!-- ══════════════════════════════════════════════════════════
           WELCOME / AUTH  (Figma HOMEPAGE redesign)
      ═══════════════════════════════════════════════════════════ -->
      <section v-if="screen === 'auth'" class="hpAuth">
        <div class="sectionPentoBg" aria-hidden="true"><div v-for="(p,i) in bouncingPieces" :key="'a'+i" class="floatingPieceWrap" :style="{left:p.x+'px',top:p.y+'px'}"><svg :width="p.svgW" :height="p.svgH" :viewBox="`0 0 ${p.svgW} ${p.svgH}`" :style="{opacity:p.opacity}" xmlns="http://www.w3.org/2000/svg"><rect v-for="(cell,j) in p.cells" :key="j" :x="cell[1]*42+1" :y="cell[0]*42+1" width="40" height="40" :fill="p.color" rx="4"/></svg></div></div>

        <!-- Mobile landscape hint: zoom out + hide URL bar for best experience -->
        <Transition name="mobileHintFade">
          <div v-if="mobileAuthLandscapeHint" class="mobileAuthHint" role="status">
            <span class="mobileAuthHintIcon">📱</span>
            <span class="mobileAuthHintText">
              <strong>Tip:</strong> Pinch to zoom out &amp; swipe up to hide the URL bar for the best experience.
            </span>
            <button class="mobileAuthHintClose" @click="mobileAuthLandscapeHintDismissed = true" aria-label="Dismiss">✕</button>
          </div>
        </Transition>
        <div class="hpLeft">
          <div class="hpVideoWrap">
            <iframe
              class="hpVideoFrame"
              src="https://www.youtube.com/embed/Iqr3XIhSnUQ?autoplay=1&mute=1&loop=1&playlist=Iqr3XIhSnUQ&controls=0&modestbranding=1&rel=0"
              title="PENTObattle trailer"
              frameborder="0"
              allow="autoplay; encrypted-media"
            ></iframe>
            <!-- Overlay: blocks YouTube hover UI, opens custom modal on click -->
            <div class="hpVideoOverlay" @click="openYtModal">
              <div class="hpVideoPlayBtn">
                <img :src="playBtnUrl" class="hpVideoPlayImg" alt="Play" />
              </div>
            </div>
          </div>
          <img :src="hpWatchTutorialUrl" class="hpWatchLabel" alt="WATCH TUTORIAL" />
        </div>

        <!-- Right column: brand + buttons -->
        <div class="hpRight">
          <div class="hpBrand">
            <img :src="hpLogoUrl" class="hpBrandLogo" alt="" />
            <div class="hpBrandText">
              <img :src="hpTitleUrl" class="hpBrandTitle" alt="PENTObattle" />
              <img :src="hpTaglineUrl" class="hpBrandTagline" alt="FLIP ROTATE DOMINATE" />
            </div>
          </div>

          <div class="hpBtns">
            <template v-if="loggedIn">
              <button class="hpBtn hpBtnContinue" @mouseenter="uiHover" @click="uiClick(); navTo('mode')">
                <img :src="hpContinueBtnUrl" class="hpBtnImg" alt="" />
                <div class="hpContinueOverlay">
                  <span class="hpContinueLabel">CONTINUE</span>
                  <span class="hpContinueName">{{ displayName }}</span>
                </div>
              </button>
            </template>
            <template v-else>
              <button class="hpBtn" @mouseenter="uiHover" @click="uiClick(); openAuthModal('login')">
                <img :src="hpLoginBtnUrl" class="hpBtnImg" alt="LOGIN" />
              </button>
              <button class="hpBtn" @mouseenter="uiHover" @click="uiClick(); playAsGuest()">
                <img :src="hpGuestBtnUrl" class="hpBtnImg" alt="GUEST" />
              </button>
            </template>
          </div>
        </div>

        <!-- Bottom bar: decorative strip fixed at very bottom, author inside bottom-left -->
        <div class="hpBottomBar" :style="{ '--hp-bottombar-img': `url(${hpAuthBottombarUrl})` }">
          <img :src="hpAuthorUrl" class="hpAuthor" alt="Developed by MUMUCHXM" />
        </div>

      </section>


      <!-- ══════════════════════════════════════════════════════════
           MAIN MENU  (Figma MENU redesign)
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'mode'" class="mnMenu">
        <div class="sectionPentoBg" aria-hidden="true"><div v-for="(p,i) in bouncingPieces" :key="'m'+i" class="floatingPieceWrap" :style="{left:p.x+'px',top:p.y+'px'}"><svg :width="p.svgW" :height="p.svgH" :viewBox="`0 0 ${p.svgW} ${p.svgH}`" :style="{opacity:p.opacity}" xmlns="http://www.w3.org/2000/svg"><rect v-for="(cell,j) in p.cells" :key="j" :x="cell[1]*42+1" :y="cell[0]*42+1" width="40" height="40" :fill="p.color" rx="4"/></svg></div></div>

        <!-- Left column: empty space, brand anchored to bottom-left -->
        <div class="mnLeft">
          <div class="mnBrand">
            <img :src="menuLogoUrl" class="mnBrandLogo" alt="" />
            <img :src="menuTitleUrl" class="mnBrandTitle" alt="PENTObattle" />
          </div>
        </div>

        <!-- Right column: button stack bleeding off right edge -->
        <div class="mnRight">
          <div class="mnBtns">
            <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); navTo('multiplayer')">
              <img :src="menuDuonlineBtnUrl" class="mnBtnImg" alt="DUOnline" />
            </button>
            <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); navTo('solo')">
              <img :src="menuSolonlineBtnUrl" class="mnBtnImg" alt="SOLOnline" />
            </button>
            <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); navTo('settings')">
              <img :src="menuSettingsBtnUrl" class="mnBtnImg" alt="SETTINGS" />
            </button>
            <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); navTo('credits')">
              <img :src="menuCreditsBtnUrl" class="mnBtnImg" alt="CREDITS" />
            </button>
          </div>
        </div>

      </section>


      <!-- ══════════════════════════════════════════════════════════
           MULTIPLAYER MENU  (Figma DUOnline redesign)
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'multiplayer'" class="mnMenu">
        <div class="sectionPentoBg" aria-hidden="true"><div v-for="(p,i) in bouncingPieces" :key="'mp'+i" class="floatingPieceWrap" :style="{left:p.x+'px',top:p.y+'px'}"><svg :width="p.svgW" :height="p.svgH" :viewBox="`0 0 ${p.svgW} ${p.svgH}`" :style="{opacity:p.opacity}" xmlns="http://www.w3.org/2000/svg"><rect v-for="(cell,j) in p.cells" :key="j" :x="cell[1]*42+1" :y="cell[0]*42+1" width="40" height="40" :fill="p.color" rx="4"/></svg></div></div>

        <div class="mnLeft">
          <div class="mnBrand">
            <img :src="mpLogoUrl" class="mnBrandLogo" alt="" />
            <img :src="mpTitleUrl" class="mnBrandTitle" alt="PENTObattle" />
          </div>
        </div>

        <div class="mnRight">
          <div class="mnSlideWrap">
          <Transition name="mn-slide" mode="out-in">
            <div v-if="qmPickerOpen" key="qm-picker">
              <div class="mnPickerLabel">SELECT QUICK PLAY MODE</div>
              <div class="mnBtns">
                <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); startQuickMatchAuto()">
                  <img :src="standardBtnUrl" class="mnBtnImg" alt="STANDARD" />
                </button>
                <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); startMirrorWarMode()">
                  <img :src="mirrorwarBtnUrl" class="mnBtnImg" alt="MIRROR WAR" />
                </button>
                <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); startBlindDraftMode()">
                  <img :src="blindraftBtnUrl" class="mnBtnImg" alt="BLIND DRAFT" />
                </button>
              </div>
            </div>
            <div v-else key="qm-main" class="mnBtns">
              <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); qmPickerOpen = true">
                <img :src="mpQuickBtnUrl" class="mnBtnImg" alt="QUICK PLAY" />
              </button>
              <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); loggedIn ? goRanked() : showLoginRequired('Ranked')">
                <img :src="mpRankedBtnUrl" class="mnBtnImg" :style="!loggedIn ? 'opacity:0.45;filter:grayscale(0.5)' : ''" alt="RANKED" />
              </button>
              <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); navTo('lobby')">
                <img :src="mpLobbyBtnUrl" class="mnBtnImg" alt="LOBBY" />
              </button>
            </div>
          </Transition>
          </div>
        </div>

      </section>


      <!-- ══════════════════════════════════════════════════════════
           SOLO MENU  (Figma SOLOnline redesign)
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'solo'" class="mnMenu">
        <div class="sectionPentoBg" aria-hidden="true"><div v-for="(p,i) in bouncingPieces" :key="'sl'+i" class="floatingPieceWrap" :style="{left:p.x+'px',top:p.y+'px'}"><svg :width="p.svgW" :height="p.svgH" :viewBox="`0 0 ${p.svgW} ${p.svgH}`" :style="{opacity:p.opacity}" xmlns="http://www.w3.org/2000/svg"><rect v-for="(cell,j) in p.cells" :key="j" :x="cell[1]*42+1" :y="cell[0]*42+1" width="40" height="40" :fill="p.color" rx="4"/></svg></div></div>

        <div class="mnLeft">
          <div class="mnBrand">
            <img :src="soloLogoUrl" class="mnBrandLogo" alt="" />
            <img :src="soloTitleUrl" class="mnBrandTitle" alt="PENTObattle" />
          </div>
        </div>

        <div class="mnRight">
          <div class="mnSlideWrap">
          <Transition name="mn-slide" mode="out-in">
            <div v-if="couchPickerOpen" key="couch-picker">
              <div class="mnPickerLabel">SELECT COUCH PLAY MODE</div>
              <div class="mnBtns">
                <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); couchPickerOpen = false; startCouchPlay()">
                  <img :src="standardBtnUrl" class="mnBtnImg" alt="STANDARD" />
                </button>
                <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); startCouchMirrorWar()">
                  <img :src="mirrorwarBtnUrl" class="mnBtnImg" alt="MIRROR WAR" />
                </button>
                <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); startCouchBlindDraft()">
                  <img :src="blindraftBtnUrl" class="mnBtnImg" alt="BLIND DRAFT" />
                </button>
              </div>
            </div>
            <div v-else key="solo-main" class="mnBtns">
              <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); navTo('story')">
                <img :src="soloVsAiBtnUrl" class="mnBtnImg" alt="VERSUS AI" />
              </button>
              <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); couchPickerOpen = true">
                <img :src="soloCouchBtnUrl" class="mnBtnImg" alt="COUCH" />
              </button>
              <button class="mnBtn" @mouseenter="uiHover" @click="uiClick(); startPuzzleMode()">
                <img :src="soloPuzzleBtnUrl" class="mnBtnImg" alt="ZEN PUZZLE" />
              </button>
            </div>
          </Transition>
          </div>
        </div>

      </section>


      <!-- ══════════════════════════════════════════════════════════
           PENTWELVE — VERSUS AI
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'story'" class="vsaiShell">

        <!-- Back button — figma style, absolute for vsai layout -->
        <button class="figmaNavBtn figmaBackBtn vsaiFigmaBackBtn" @mouseenter="uiHover" @click="uiClick(); goBack()" aria-label="Back">
          <img :src="backBtnUrl" class="figmaNavBtnImg" alt="BACK" />
        </button>

        <!-- Main content area -->
        <div class="vsaiContent">

          <!-- Staircase: 6 rows, top = highest rank, bottom = lowest rank -->
          <Transition :name="'stair-' + storyDir">
          <div class="vsaiStaircase" :key="storyPage">
            <template v-for="(entry, rowIdx) in (storyPage === 'lower' ? storyChaptersReversed.slice(6) : storyChaptersReversed.slice(0, 6))" :key="entry.ch.id">
              <div
                class="vsaiRow"
                :class="{
                  vsaiRowLocked:  !storyProgress.unlocked.has(entry.idx),
                  vsaiRowCleared: storyProgress.cleared.has(entry.idx),
                  vsaiRowActive:  entry.idx === storyProgress.completed
                }"
                :style="{ '--row': rowIdx }"
                @click="storyProgress.unlocked.has(entry.idx) && startStoryChapter(entry.idx)"
              >
                <!-- Unlocked: show figma character PNG row -->
                <img
                  v-if="storyProgress.unlocked.has(entry.idx)"
                  :src="vsaiCharUrls[entry.ch.vsaiKey]"
                  class="vsaiRowImg"
                  draggable="false"
                />
                <!-- Locked: plain dark placeholder bar -->
                <div v-else class="vsaiRowLock">
                  <span class="vsaiRowLockNum">{{ String(12 - entry.idx).padStart(2,'0') }}</span>
                  <span class="vsaiRowLockText">🔒 ???</span>
                </div>
                <!-- Active arrow only -->
                <div v-if="entry.idx === storyProgress.completed && !storyProgress.cleared.has(entry.idx)" class="vsaiRowArrow">▶</div>
              </div>
            </template>
          </div>
          </Transition>

        </div><!-- end vsaiContent -->

        <!-- PENTWELVE + LOWER/UPPER SIX labels — anchored to shell, not scrollable -->
        <div class="vsaiLabel">
          <!-- Champion badge — shown above title when all 12 cleared -->
          <div v-if="storyProgress.completed >= 12" class="vsaiChamp">
            <span class="vsaiChampCrown">🏆</span>
            <div class="vsaiChampTitle">PENTWELVE CHAMPION</div>
            <div class="vsaiChampSub">You came from nothing. Now you are the standard.</div>
          </div>
          <img :src="vsaiPentwelveUrl" class="vsaiLabelTitle" draggable="false" />
          <div class="vsaiLabelSixRow">
            <img
              :src="storyPage === 'lower' ? vsaiLowerSixUrl : vsaiUpperSixUrl"
              class="vsaiLabelSix"
              draggable="false"
            />
          </div>
          <!-- Progress -->
          <div class="vsaiProgress">
            <div class="vsaiProgressTrack">
              <div class="vsaiProgressFill" :style="{ width: (storyProgress.completed / 12 * 100) + '%' }"></div>
            </div>
            <span class="vsaiProgressText">{{ storyProgress.completed }} / 12 CLEARED</span>
          </div>
          <!-- Page toggle buttons — below progress bar -->
          <div class="vsaiControls">
            <button
              v-if="storyPage === 'lower' && storyProgress.completed >= 6"
              class="vsaiSwitchBtn"
              @mouseenter="uiHover" @click="uiClick(); switchStoryPage('upper')"
            >UPPER SIX ▶</button>
            <button
              v-if="storyPage === 'upper'"
              class="vsaiSwitchBtn"
              @mouseenter="uiHover" @click="uiClick(); switchStoryPage('lower')"
            >◀ LOWER SIX</button>
          </div>
        </div>


      </section>


      <!-- ══════════════════════════════════════════════════════════
      <!-- ══════════════════════════════════════════════════════════
           LEADERBOARDS
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'leaderboards'" class="menuShell pbShell pbShellCentered">
        <div class="vsStylePanel">
          <div class="vsStyleHeader">
            <div class="vsStyleHeaderGlow"></div>
            <div class="vsStyleTitle">🏆 LEADERBOARDS</div>
            <div class="vsStyleSubtitle">Rankings · Records · Hall of Fame</div>
          </div>
          <div class="vsStyleCards">
            <div class="vsStyleCard">
              <div class="vsStyleCardTitle">RANKED STANDINGS</div>
              <div class="pbFineLine">Ranked leaderboard coming soon.</div>
            </div>
            <div class="vsStyleCard">
              <div class="vsStyleCardTitle">PUZZLE FASTEST SOLVE</div>
              <div class="pbFineLine">Puzzle leaderboard coming soon.</div>
            </div>
            <div class="vsStyleCard">
              <div class="vsStyleCardTitle">HALL OF FAME</div>
              <div class="pbFineLine">Top all-time players coming soon.</div>
            </div>
          </div>
        </div>
      </section>


      <!-- ══════════════════════════════════════════════════════════
           SHOP
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'shop'" class="menuShell pbShell pbShellCentered">
        <div class="vsStylePanel">
          <div class="vsStyleHeader">
            <div class="vsStyleHeaderGlow"></div>
            <div class="vsStyleTitle">🛒 SHOP</div>
            <div class="vsStyleSubtitle">Cosmetics · Themes · Coming Soon</div>
          </div>
          <div class="vsStyleCards">
            <div class="vsStyleCard">
              <div class="vsStyleCardTitle">COMING SOON</div>
              <div class="pbFineLine">The shop is under construction. Check back later!</div>
            </div>
          </div>
        </div>
      </section>


      <!-- ══════════════════════════════════════════════════════════
           PROFILE
      ═══════════════════════════════════════════════════════════ -->
      <!-- ══════════════════════════════════════════════════════════
           PROFILE PAGE  (chess.com-style)
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'profile'" class="menuShell pbNewProfile">

        <!-- Guest / not logged in -->
        <template v-if="!loggedIn">
          <div class="pbNPGuestWrap">
            <div class="pbNPGuestTitle">Sign in to view your profile</div>
            <div class="pbNPGuestSub">Access ranked stats, match history, friends, and more.</div>
            <div class="pbNPGuestBtns">
              <button class="pbNPActionBtn pbNPActionPrimary" @click="openAuthModal('login')">LOG IN</button>
              <button class="pbNPActionBtn" @click="openAuthModal('signup')">CREATE ACCOUNT</button>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- ── Banner area ── -->
          <div class="pbNPBanner">
            <div class="pbNPBannerGrad"></div>
          </div>

          <!-- ── Hero row ── -->
          <div class="pbNPHero">
            <div class="pbNPAvatarWrap">
              <img :src="guestAvatarUrl" class="pbNPAvatar" alt="Avatar" />
              <span class="pbNPOnlineDot" v-if="!viewingFriendId || onlineUserIds?.has(viewingFriendId)" title="Online now"></span>
            </div>

            <div class="pbNPHeroInfo">
              <div class="pbNPHeroName">
                {{ viewingFriendData ? viewingFriendData.name : displayName }}
                <span class="pbNPHeroFlag">🇵🇭</span>
              </div>
              <div class="pbNPHeroStatus">{{ viewingFriendId ? (onlineUserIds?.has(viewingFriendId) ? '● Online now' : '● Offline') : 'Enter a status here…' }}</div>
              <div class="pbNPHeroMeta">
                <span class="pbNPMetaItem">
                  <b>{{ (viewingFriendData ? viewingFriendData.uid : memberStats.uid) ? '#' + (viewingFriendData ? viewingFriendData.uid : memberStats.uid) : '—' }}</b> UID
                </span>
                <span class="pbNPMetaDot">·</span>
                <span class="pbNPMetaItem">
                  <b>{{ (viewingFriendData ? viewingFriendData.wins : memberStats.wins) || 0 }}</b> Wins
                </span>
              </div>
            </div>

            <div class="pbNPHeroActions">
              <template v-if="viewingFriendId">
                <button class="pbNPActionBtn pbNPActionPrimary" @click="sendFriendRequest(viewingFriendId)" v-if="!friendsList.find(f=>f.friend_id===viewingFriendId)">+ FRIEND</button>
                <button class="pbNPActionBtn" @click="viewingFriendId = null; viewingFriendData = null">← BACK TO MY PROFILE</button>
              </template>
              <template v-else>
                <button class="pbNPActionBtn pbNPActionEdit">✎ Edit Profile</button>
              </template>
            </div>
          </div>

          <!-- ── Tab nav ── -->
          <div class="pbNPTabNav">
            <button
              v-for="tab in profileTabs" :key="tab.key"
              class="pbNPTab"
              :class="{ active: profileTab === tab.key }"
              @click="profileTab = tab.key"
            >{{ tab.label }}</button>
          </div>

          <!-- ══ OVERVIEW TAB ══ -->
          <div v-if="profileTab === 'overview'" class="pbNPBody">

            <div class="pbNPMain">
              <!-- Mode rating cards row -->
              <div class="pbNPRatingCards">
                <!-- Standard -->
                <div class="pbNPRatingCard">
                  <div class="pbNPRatingIcon">⚔</div>
                  <div class="pbNPRatingInfo">
                    <div class="pbNPRatingMode">Standard</div>
                    <div class="pbNPRatingVal">{{ (viewingFriendData || memberStats).ranked_lp || 0 }}</div>
                    <div class="pbNPRatingBar">
                      <div class="pbNPRatingBarFill" :class="'pbTierFill-' + ((viewingFriendData || memberStats).ranked_tier || 'plastic')"
                           :style="{ width: lpBarPercent((viewingFriendData || memberStats).ranked_lp, (viewingFriendData || memberStats).ranked_tier) + '%' }"></div>
                    </div>
                  </div>
                </div>
                <!-- Mirror War -->
                <div class="pbNPRatingCard">
                  <div class="pbNPRatingIcon">🪞</div>
                  <div class="pbNPRatingInfo">
                    <div class="pbNPRatingMode">Mirror War</div>
                    <div class="pbNPRatingVal">—</div>
                    <div class="pbNPRatingBar"><div class="pbNPRatingBarFill" style="width:0%"></div></div>
                  </div>
                </div>
                <!-- Blind Draft -->
                <div class="pbNPRatingCard">
                  <div class="pbNPRatingIcon">🎲</div>
                  <div class="pbNPRatingInfo">
                    <div class="pbNPRatingMode">Blind Draft</div>
                    <div class="pbNPRatingVal">—</div>
                    <div class="pbNPRatingBar"><div class="pbNPRatingBarFill" style="width:0%"></div></div>
                  </div>
                </div>
              </div>

              <!-- Game History table -->
              <div class="pbNPSection">
                <div class="pbNPSectionHead">
                  Game History
                  <span class="pbNPSectionCount">({{ mh.total }})</span>
                </div>

                <div v-if="mh.loading" class="pbNPLoading">Loading…</div>
                <div v-else-if="mh.items.length === 0" class="pbNPEmpty">No matches yet. Play an online game!</div>
                <template v-else>
                  <table class="pbNPTable">
                    <thead>
                      <tr>
                        <th>Players</th>
                        <th>Result</th>
                        <th>Mode</th>
                        <th>Duration</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="m in mh.items" :key="m.id"
                        class="pbNPTableRow"
                        :class="m.result === 'W' ? 'npWin' : m.result === 'L' ? 'npLoss' : 'npDraw'"
                      >
                        <td class="pbNPTdPlayers">
                          <span class="pbNPPlayer pbNPPlayerMe">{{ displayName }}</span>
                          <span class="pbNPVs">vs</span>
                          <span class="pbNPPlayer">{{ m.opponentName }}</span>
                        </td>
                        <td>
                          <span class="pbNPResultBadge" :class="m.result.toLowerCase()">
                            {{ m.result === 'W' ? 'WIN' : m.result === 'L' ? 'LOSS' : 'DRAW' }}
                          </span>
                        </td>
                        <td class="pbNPTdMode">{{ (m.mode || 'online').toUpperCase() }}</td>
                        <td>{{ mhFormatDuration(m.duration_sec) }}</td>
                        <td class="pbNPTdDate">{{ mhFormatDate(m.created_at) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <!-- Pagination -->
                  <div v-if="mh.total > mhPageSize" class="pbNPPagination">
                    <button class="pbNPPageBtn" :disabled="mh.page === 0" @click="mhChangePage(mh.page - 1)">‹</button>
                    <span class="pbNPPageInfo">{{ mh.page + 1 }} / {{ mhPageCount }}</span>
                    <button class="pbNPPageBtn" :disabled="mh.page >= mhPageCount - 1" @click="mhChangePage(mh.page + 1)">›</button>
                  </div>
                </template>
              </div>
            </div>

            <!-- Sidebar -->
            <div class="pbNPSidebar">
              <!-- Rank card -->
              <div class="pbNPSideCard">
                <div class="pbNPSideCardTitle">RANK</div>
                <div class="pbNPSideRankBadge" :class="'pbTier-' + (memberStats.ranked_tier || 'plastic')">
                  {{ rankedTier }}
                </div>
                <div class="pbNPSideRankLp">{{ memberStats.ranked_lp }} LP</div>
                <div class="pbNPSideRankRecord">
                  <span class="pbNPRW">{{ memberStats.ranked_wins }}W</span>
                  <span class="pbNPRL">{{ memberStats.ranked_losses }}L</span>
                  <span class="pbNPRWr" v-if="memberStats.ranked_wins + memberStats.ranked_losses > 0">
                    {{ Math.round(memberStats.ranked_wins / (memberStats.ranked_wins + memberStats.ranked_losses) * 100) }}% WR
                  </span>
                </div>
                <div v-if="memberStats.win_streak >= 3" class="pbNPStreakBadge">🔥 {{ memberStats.win_streak }}-win streak</div>
                <div v-if="memberStats.demotion_shield > 0" class="pbNPShieldBadge">🛡 Demotion Shield</div>
              </div>

              <!-- Overall stats card -->
              <div class="pbNPSideCard">
                <div class="pbNPSideCardTitle">STATS</div>
                <div class="pbNPStatRow"><span>Total Wins</span><b>{{ memberStats.wins }}</b></div>
                <div class="pbNPStatRow"><span>Total Losses</span><b>{{ memberStats.losses }}</b></div>
                <div class="pbNPStatRow"><span>Total Draws</span><b>{{ memberStats.draws }}</b></div>
                <div class="pbNPStatRow" v-if="memberStats.wins + memberStats.losses > 0">
                  <span>Win Rate</span>
                  <b>{{ Math.round(memberStats.wins / (memberStats.wins + memberStats.losses) * 100) }}%</b>
                </div>
              </div>
            </div>

          </div>

          <!-- ══ STATS TAB ══ -->
          <div v-else-if="profileTab === 'stats'" class="pbNPBody">
            <div class="pbNPMain">
              <div class="pbNPSection">
                <div class="pbNPSectionHead">Ranked Performance</div>
                <div class="pbNPStatGrid">
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.ranked_wins }}</div><div class="pbNPStatBlockLbl">Ranked Wins</div></div>
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.ranked_losses }}</div><div class="pbNPStatBlockLbl">Ranked Losses</div></div>
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.ranked_lp }}</div><div class="pbNPStatBlockLbl">Current LP</div></div>
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.ranked_peak_lp }}</div><div class="pbNPStatBlockLbl">Peak LP</div></div>
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.wins }}</div><div class="pbNPStatBlockLbl">Total Wins</div></div>
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.losses }}</div><div class="pbNPStatBlockLbl">Total Losses</div></div>
                  <div class="pbNPStatBlock"><div class="pbNPStatBlockNum">{{ memberStats.draws }}</div><div class="pbNPStatBlockLbl">Draws</div></div>
                  <div class="pbNPStatBlock">
                    <div class="pbNPStatBlockNum">
                      {{ memberStats.wins + memberStats.losses > 0 ? Math.round(memberStats.wins / (memberStats.wins + memberStats.losses) * 100) + '%' : '—' }}
                    </div>
                    <div class="pbNPStatBlockLbl">Win Rate</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="pbNPSidebar">
              <div class="pbNPSideCard">
                <div class="pbNPSideCardTitle">RANK</div>
                <div class="pbNPSideRankBadge" :class="'pbTier-' + (memberStats.ranked_tier || 'plastic')">{{ rankedTier }}</div>
                <div class="pbNPSideRankLp">{{ memberStats.ranked_lp }} LP</div>
              </div>
            </div>
          </div>

          <!-- ══ OTHER TABS (coming soon) ══ -->
          <div v-else class="pbNPBody">
            <div class="pbNPComingSoon">
              <div class="pbNPComingSoonIcon">🚧</div>
              <div class="pbNPComingSoonText">{{ profileTabs.find(t => t.key === profileTab)?.label }} — Coming Soon</div>
            </div>
          </div>

        </template>
      </section>


      <!-- ══════════════════════════════════════════════════════════
           MATCH HISTORY
      ═══════════════════════════════════════════════════════════ -->
      <section v-else-if="screen === 'match-history'" class="menuShell pbShell pbShellCentered mhScreen">
        <div class="vsStylePanel mhPanel">
          <!-- Header -->
          <div class="vsStyleHeader">
            <div class="vsStyleHeaderGlow mhHeaderGlow"></div>
            <div class="vsStyleTitle">⚔ MATCH HISTORY</div>
            <div class="vsStyleSubtitle">{{ loggedIn ? displayName + ' · Recent Matches' : 'Sign in to view your matches' }}</div>
          </div>

          <!-- Not logged in guard -->
          <template v-if="!loggedIn">
            <div class="vsStyleCard" style="text-align:center;padding:28px 18px">
              <div class="vsStyleCardTitle">AUTH REQUIRED</div>
              <div class="pbFineLine" style="margin-bottom:14px">Log in to access your match history.</div>
              <button class="pbMiniBtn primary" @click="openAuthModal('login')">LOGIN</button>
            </div>
          </template>

          <!-- Logged in -->
          <template v-else>

            <!-- Filter + summary bar -->
            <div class="mhFilterBar">
              <div class="mhFilterTabs">
                <button
                  v-for="f in mhFilters" :key="f.key"
                  class="mhFilterTab"
                  :class="{ active: mh.filter === f.key }"
                  @click="mhSetFilter(f.key)"
                >{{ f.label }}</button>
              </div>
              <div class="mhPageInfo" v-if="!mh.loading && mh.total > 0">
                {{ mh.page * mhPageSize + 1 }}–{{ Math.min((mh.page + 1) * mhPageSize, mh.total) }} of {{ mh.total }}
              </div>
            </div>

            <!-- Loading skeleton -->
            <div v-if="mh.loading" class="mhSkeletonList">
              <div v-for="n in 5" :key="n" class="mhSkeleton"></div>
            </div>

            <!-- Empty state -->
            <div v-else-if="mh.items.length === 0" class="vsStyleCard mhEmpty">
              <div class="mhEmptyIcon">🎮</div>
              <div class="mhEmptyTitle">NO MATCHES YET</div>
              <div class="pbFineLine">{{ mh.filter === 'all' ? 'Play an online match to see your history here.' : 'No ' + mh.filter + ' matches to show.' }}</div>
            </div>

            <!-- Match list -->
            <div v-else class="mhList">
              <div
                v-for="m in mh.items"
                :key="m.id"
                class="mhCard"
                :class="{ win: m.result === 'W', loss: m.result === 'L', draw: m.result === 'D', expanded: mh.expandedId === m.id }"
                @click="mhToggleExpand(m.id)"
              >
                <!-- Main row -->
                <div class="mhCardMain">
                  <div class="mhResultBadge" :class="m.result.toLowerCase()">{{ m.result }}</div>
                  <div class="mhCardBody">
                    <div class="mhCardOpponent">vs <span class="mhOppName">{{ m.opponentName }}</span></div>
                    <div class="mhCardMeta">
                      <span class="mhMetaTag" :class="'er-' + m.end_reason">{{ mhEndReasonLabel(m.end_reason) }}</span>
                      <span class="mhMetaDot">·</span>
                      <span>{{ mhFormatDuration(m.duration_sec) }}</span>
                      <span class="mhMetaDot">·</span>
                      <span>{{ mhFormatDate(m.created_at) }}</span>
                    </div>
                  </div>
                  <div class="mhCardChevron" :class="{ open: mh.expandedId === m.id }">›</div>
                </div>

                <!-- Expanded detail -->
                <div v-if="mh.expandedId === m.id" class="mhExpandedBody" @click.stop>
                  <div class="mhExpandGrid">
                    <div class="mhExpandCell">
                      <div class="mhExpandLabel">MODE</div>
                      <div class="mhExpandVal">{{ (m.mode || 'online').toUpperCase() }}</div>
                    </div>
                    <div class="mhExpandCell">
                      <div class="mhExpandLabel">ROUND</div>
                      <div class="mhExpandVal">{{ m.round_number || 1 }}</div>
                    </div>
                    <div class="mhExpandCell">
                      <div class="mhExpandLabel">OUTCOME</div>
                      <div class="mhExpandVal" :class="m.result === 'W' ? 'mhWinTxt' : m.result === 'L' ? 'mhLossTxt' : ''">
                        {{ m.result === 'W' ? 'VICTORY' : m.result === 'L' ? 'DEFEAT' : 'DRAW' }}
                      </div>
                    </div>
                    <div class="mhExpandCell">
                      <div class="mhExpandLabel">DURATION</div>
                      <div class="mhExpandVal">{{ mhFormatDuration(m.duration_sec) }}</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <!-- Pagination -->
            <div v-if="mh.total > mhPageSize" class="mhPagination">
              <button class="mhPageBtn" :disabled="mh.page === 0" @click="mhChangePage(mh.page - 1)">‹ PREV</button>
              <div class="mhPageDots">
                <span
                  v-for="pg in mhPageCount" :key="pg"
                  class="mhPageDot"
                  :class="{ active: mh.page === pg - 1 }"
                  @click="mhChangePage(pg - 1)"
                ></span>
              </div>
              <button class="mhPageBtn" :disabled="mh.page >= mhPageCount - 1" @click="mhChangePage(mh.page + 1)">NEXT ›</button>
            </div>

          </template>
        </div>
      </section>


      <!-- ══════════════════════════════════════════════════════════
           PUZZLE PLACEHOLDER
      ═══════════════════════════════════════════════════════════ -->
      <!-- puzzle screen: handled by the game canvas (v-else below) -->


      <!-- ══════════════════════════════════════════════════════════
           LOBBY
      ═══════════════════════════════════════════════════════════ -->
      <!-- =========================
           LOBBY
      ========================== -->
      <section v-else-if="screen === 'lobby'" class="menuShell pbShell pbShellCentered lobbyScreen">
        <div class="vsStylePanel">
          <div class="vsStyleCards">
            <div class="pbCard">
            <div class="pbTitleRow">
              <div class="pbTitle">CREATE SESSION</div>
              <div class="pbHint">PUBLIC OR PRIVATE</div>
            </div>

            <div class="pbForm">
              <label class="pbField">
                <span>LOBBY NAME</span>
                <input v-model="quick.lobbyName" class="pbInput" placeholder="e.g., Mumuchxm room" />
              </label>

              <div class="pbField">
                <span>GAME MODE</span>
                <div class="lobbyModePills">
                  <button class="mhFilterTab" :class="{ active: lobbyModeOption === 'normal' }" @click="lobbyModeOption = 'normal'">NORMAL</button>
                  <button class="mhFilterTab" :class="{ active: lobbyModeOption === 'mirror_war' }" @click="lobbyModeOption = 'mirror_war'">MIRROR WAR</button>
                  <button class="mhFilterTab" :class="{ active: lobbyModeOption === 'blind_draft' }" @click="lobbyModeOption = 'blind_draft'">BLIND DRAFT</button>
                </div>
              </div>

              <label class="pbField inline">
                <span>PRIVATE</span>
                <input class="pbCheck" type="checkbox" v-model="quick.isPrivate" />
              </label>
            </div>

            <div class="pbRow">
              <button class="pbMiniBtn" @mouseenter="uiHover" @click="uiClick(); refreshLobby()" aria-label="Refresh">REFRESH</button>
              <button class="pbMiniBtn primary" @mouseenter="uiHover" @click="uiClick(); lobbyCreate()" aria-label="Create">CREATE</button>
            </div>

            <div class="pbDivider"></div>

            <div class="pbTitleRow">
              <div class="pbTitle">JOIN / SEARCH</div>
              <div class="pbHint">CODE OR NAME</div>
            </div>

            <div class="pbForm">
              <label class="pbField">
                <span>CODE OR NAME</span>
                <input
                  v-model="quick.joinCode"
                  class="pbInput"
                  placeholder="PB-XXXXYYYY or lobby name"
                  @keydown.enter.prevent="lobbySearchOrJoin"
                />
              </label>
            </div>

            <div class="pbRow">
              <button class="pbMiniBtn primary" @mouseenter="uiHover" @click="uiClick(); lobbySearchOrJoin()" aria-label="Go">GO</button>
            </div>

            <div class="pbDivider"></div>

            <div class="pbTitleRow">
              <div class="pbTitle">AVAILABLE ROOMS</div>
              <div class="pbHint">{{ publicLobbies.length }} FOUND</div>
            </div>

            <div v-if="loadingPublic" class="pbFineLine">Loading rooms…</div>
            <div v-else-if="!publicLobbies.length" class="pbFineLine">No public rooms waiting right now.</div>

            <div v-else class="pbLobbyList">
              <div class="pbLobbyRow" v-for="l in publicLobbies" :key="l.id">
                <div class="pbLobbyInfo">
                  <div class="pbLobbyName">
                    {{ l.lobby_name || "Public Lobby" }}
                    <span v-if="l.mode === 'mirror_war'" class="lobbyModeBadge badgeMW">MW</span>
                    <span v-else-if="l.mode === 'blind_draft'" class="lobbyModeBadge badgeBD">BD</span>
                  </div>
                  <div class="pbLobbyMeta">
                    Code: <b>{{ l.code || "—" }}</b>
                    <span class="dot">•</span>
                    Players: <b>{{ lobbyCountLabel(l) }}</b>
                  </div>
                </div>

                <button
                  class="pbMiniBtn primary joinBtn"
                  @mouseenter="uiHover"
                  @click="uiClick(); joinPublicLobby(l)"
                >
                  JOIN
                </button>
              </div>
            </div>

            <div v-if="myPrivateLobbies.length" class="pbDivider"></div>

            <div v-if="myPrivateLobbies.length" class="pbTitleRow">
              <div class="pbTitle">YOUR PRIVATE SESSIONS</div>
              <div class="pbHint">{{ myPrivateLobbies.length }}</div>
            </div>

            <div v-if="myPrivateLobbies.length" class="pbLobbyList">
              <div class="pbLobbyRow" v-for="l in myPrivateLobbies" :key="'p_'+l.id">
                <div class="pbLobbyInfo">
                  <div class="pbLobbyName">{{ l.lobby_name || "Private Lobby" }}</div>
                  <div class="pbLobbyMeta">
                    Code: <b>{{ l.code || "—" }}</b>
                    <span class="dot">•</span>
                    Status: <b>{{ l.status || "waiting" }}</b>
                  </div>
                </div>

                <button class="pbMiniBtn" @mouseenter="uiHover" @click="uiClick(); copyCode(l.code)">COPY</button>
                <button class="pbMiniBtn primary joinBtn" @mouseenter="uiHover" @click="uiClick(); reEnterLobby(l)">
                  ENTER
                </button>
              </div>
            </div>

            <div class="pbFineLine">
              Private rooms are hidden — join by code. Quick Match rooms never show up here.
            </div>
          </div>
          </div>
        </div>
      </section>

      <!-- =========================
           RANKED
      ========================== -->
	  <section v-else-if="screen === 'ranked'" class="menuShell">
          <h1 class="heroTitle small">Matchmaking</h1>
          <p class="heroDesc small">Placeholder screen for now.</p>

        <div class="menuCard">
          <div class="form">
            <div class="field">
              <span>Your Tier</span>
              <b>{{ rankedTier }}</b>
            </div>
            <div class="field">
              <span>Queue</span>
              <b>Auto find same tier</b>
            </div>
          </div>
        </div>
      </section>

      <!-- =========================
           SETTINGS
      ========================== -->
      <section v-else-if="screen === 'settings'" class="menuShell pbShell pbShellCentered settingsScreen">
        <div class="vsStylePanel">
          <div class="vsStyleCards">
            <div class="vsStyleCard">
              <div class="vsStyleCardTitle">GAMEPLAY</div>
              <label class="vsStyleRow">
                <span class="vsStyleRowLabel">Allow Flip (Mirror)</span>
                <input type="checkbox" class="vsStyleCheck" v-model="allowFlip" />
              </label>
              <label class="vsStyleRow">
                <span class="vsStyleRowLabel">Enable Drag Placement</span>
                <input type="checkbox" class="vsStyleCheck" v-model="game.ui.enableDragPlace" />
              </label>
              <label class="vsStyleRow">
                <span class="vsStyleRowLabel">Enable Click Placement</span>
                <input type="checkbox" class="vsStyleCheck" v-model="game.ui.enableClickPlace" />
              </label>
              <label class="vsStyleRow">
                <span class="vsStyleRowLabel">Enable Hover Preview</span>
                <input type="checkbox" class="vsStyleCheck" v-model="game.ui.enableHoverPreview" />
              </label>
              <label class="vsStyleRow">
                <span class="vsStyleRowLabel">Landscape Only (Mobile)</span>
                <input type="checkbox" class="vsStyleCheck" v-model="game.ui.lockLandscape" />
              </label>
              <label class="vsStyleRow">
                <span class="vsStyleRowLabel">Confirm Move (Mobile)</span>
                <input type="checkbox" class="vsStyleCheck" v-model="confirmMove" />
              </label>
            </div>

            <div class="vsStyleCard">
              <div class="vsStyleCardTitle">AUDIO</div>
              <label class="vsStyleRow slider">
                <span class="vsStyleRowLabel">BGM Volume</span>
                <input type="range" min="0" max="100" step="1" v-model.number="bgmVolumeUi" class="vsStyleSlider" />
                <span class="vsStyleSliderVal">{{ bgmVolumeUi }}%</span>
              </label>
              <label class="vsStyleRow slider">
                <span class="vsStyleRowLabel">SFX Volume</span>
                <input type="range" min="0" max="100" step="1" v-model.number="sfxVolumeUi" class="vsStyleSlider" />
                <span class="vsStyleSliderVal">{{ sfxVolumeUi }}%</span>
              </label>
            </div>

            <div class="vsStyleFinePrint">Default board: <b>10×6</b> (Mirror War uses 15×8). Tip: Q rotate · E flip</div>
          </div>
        </div>
      </section>

      <!-- =========================
           CREDITS
      ========================== -->
      <section v-else-if="screen === 'credits'" class="menuShell pbShell pbShellCentered creditsScreen">
        <div class="vsStylePanel">
          <div class="vsStyleCards">
            <div class="vsStyleCard creditCard">
              <div class="creditLine"><span class="creditLabel">GAME</span><span class="creditValue">PentoBattle</span></div>
              <div class="creditLine"><span class="creditLabel">CREATOR</span><span class="creditValue">Mumuchxm</span></div>
              <div class="creditLine"><span class="creditLabel">ENGINE</span><span class="creditValue">Vite + Vue</span></div>
              <div class="creditDivider"></div>
              <div class="creditLine"><span class="creditLabel">MUSIC</span><span class="creditValue">Playing Games</span></div>
              <div class="creditLine"><span class="creditLabel">ARTIST</span><span class="creditValue">Zambolino</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- =========================
           GAME (COUCH / AI / ONLINE)
      ========================== -->
      <section v-else class="gameLayout">
        <section class="leftPanel">
          <div class="panelHead hudPanel">

            <!-- ── TURN BANNER: the most prominent element ── -->
            <div
              class="turnBanner"
              :class="{
                tbP1: screen !== 'puzzle' && game.phase !== 'gameover' && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === 1,
                tbP2: screen !== 'puzzle' && game.phase !== 'gameover' && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === 2,
                tbPuzzle: screen === 'puzzle' && game.phase !== 'gameover',
                tbEnd: game.phase === 'gameover',
                tbYours: isOnline && myPlayer && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === myPlayer,
              }"
            >
              <div class="tbGlow" aria-hidden="true"></div>
              <div class="tbLeft">
                <div class="tbPhaseTag">{{ screen === 'puzzle' ? 'PUZZLE' : game.phase === 'draft' ? 'DRAFT' : game.phase === 'place' ? 'BATTLE' : 'END' }}</div>
                <div class="tbMain">
                  <span v-if="screen === 'puzzle' && game.phase !== 'gameover'">
                    YOUR TURN
                  </span>
                  <span v-else-if="game.phase === 'draft'">
                    <template v-if="screen === 'ai' && game.draftTurn === aiPlayer">
                      <div class="tbNameLine">
                        <span class="tbAiName" :style="{ color: storyAiColor }">{{ storyAiName }}</span>
                      </div>
                      <div class="tbActionLine">is PICKING</div>
                    </template>
                    <template v-else-if="screen === 'ai' && game.draftTurn === humanPlayer">
                      <div class="tbNameLine">
                        <span class="tbPlayerNum tbHumanName">{{ displayName ?? 'YOU' }}</span>
                        <span class="tbYouTag">YOU</span>
                      </div>
                      <div class="tbActionLine">is PICKING</div>
                    </template>
                    <template v-else>
                      <span class="tbPlayerNum">P{{ game.draftTurn }}</span> PICKING
                      <span v-if="isOnline && myPlayer === game.draftTurn" class="tbYouTag">YOU</span>
                    </template>
                  </span>
                  <span v-else-if="game.phase === 'place'">
                    <template v-if="screen === 'ai' && game.currentPlayer === aiPlayer">
                      <div class="tbNameLine">
                        <span class="tbAiName" :style="{ color: storyAiColor }">{{ storyAiName }}</span>
                      </div>
                      <div class="tbActionLine">is THINKING</div>
                    </template>
                    <template v-else-if="screen === 'ai' && game.currentPlayer === humanPlayer">
                      <div class="tbNameLine">
                        <span class="tbPlayerNum tbHumanName">{{ displayName ?? 'YOU' }}</span>
                        <span class="tbYouTag">YOU</span>
                      </div>
                      <div class="tbActionLine">is THINKING</div>
                    </template>
                    <template v-else>
                      <span class="tbPlayerNum">{{ 'P' + game.currentPlayer }}</span> TURN
                      <span v-if="isOnline && myPlayer === game.currentPlayer" class="tbYouTag">YOU</span>
                    </template>
                  </span>
                  <span v-else>GAME OVER</span>
                </div>
              </div><!-- /tbLeft -->
              <div class="tbRight">
                <!-- Draft timer pill -->
                <div v-if="timerHud?.kind === 'draft'" class="tbDraftTimer" :class="{ tbDraftUrgent: timerHud.seconds <= 10, tbDraftP2: game.draftTurn === 2 }">
                  {{ timerHud.value }}
                </div>
                <!-- Online "YOUR TURN" badge -->
                <div v-else-if="isOnline && myPlayer && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === myPlayer && game.phase !== 'gameover'" class="tbYourTurnBadge">
                  YOU
                </div>
                <!-- Online "WAITING" badge -->
                <div v-else-if="isOnline && game.phase !== 'gameover'" class="tbWaitBadge">
                  WAITING
                </div>
              </div>

              <!-- ── STORY TAUNT BUBBLE moved to body Teleport below ── -->

            </div>

            <!-- ── DUAL CLOCKS: online + AI + couch MW/BD (not normal couch or puzzle) ── -->
            <div v-if="game.phase === 'place' && screen !== 'puzzle' && !(screen === 'couch' && couchMode === 'normal')" class="hudGrid hudClocks">
              <div
                class="hudStat timer p1"
                :class="{
                  urgent: (game.battleClockSec?.[1] ?? 0) <= 30 && game.currentPlayer === 1,
                  activeClock: game.currentPlayer === 1,
                }"
              >
                <span class="statLabel">{{ isOnline && myPlayer === 1 ? 'YOU (P1)' : screen === 'ai' && !isOnline ? (aiPlayer === 2 ? 'YOU (P1)' : 'AI (P1)') : 'P1' }}</span>
                <span class="clockBadge p1">P1</span>
                <span class="statValue clockValue">{{ fmtClock(game.battleClockSec?.[1] ?? 0) }}</span>
              </div>
              <div
                class="hudStat timer p2"
                :class="{
                  urgent: (game.battleClockSec?.[2] ?? 0) <= 30 && game.currentPlayer === 2,
                  activeClock: game.currentPlayer === 2,
                }"
              >
                <span class="statLabel">{{ isOnline && myPlayer === 2 ? 'YOU (P2)' : screen === 'ai' && !isOnline ? (aiPlayer === 2 ? 'AI (P2)' : 'YOU (P2)') : 'P2' }}</span>
                <span class="clockBadge p2">P2</span>
                <span class="statValue clockValue">{{ fmtClock(game.battleClockSec?.[2] ?? 0) }}</span>
              </div>
            </div>

            <!-- ── ONLINE META: ping + code only ── -->
            <div v-if="isOnline" class="hudGrid hudMeta">
              <div class="hudStat ping" :class="pingLevelClass">
                <span class="pingDot" aria-hidden="true"></span>
                <span class="statLabel">PING</span>
                <span class="statValue">{{ pingText }}</span>
              </div>
              <div v-if="online.code" class="hudStat code">
                <span class="statLabel">CODE</span>
                <span class="mono statValue">{{ online.code }}</span>
                <button class="copyBtn" @click="copyLobbyCode" title="Copy code">COPY</button>
              </div>
            </div>

            <!-- ── BOTTOM ROW: mode label + controls hint ── -->
            <div class="hudFooter">
              <span class="hudModeChip">
                {{ modeLabel }}
                <span v-if="isOnline && myPlayer" class="hudYouInline">· YOU P{{ myPlayer }}</span>
              </span>

              <!-- OK / BAD legend dots -->
              <span v-if="isInGame" class="hudLegend">
                <span class="hudLegendItem"><span class="hudSwatch ok"></span> OK</span>
                <span class="hudLegendItem"><span class="hudSwatch bad"></span> BAD</span>
              </span>

              <span v-if="game.phase === 'place'" class="hudControlsHint">
                <b>Q</b> Rotate &nbsp;·&nbsp; <b>E</b> Flip
              </span>
            </div>

          </div>

          <!-- ── PUZZLE HUD: pieces remaining + cells covered ── -->
          <div v-if="screen === 'puzzle' && game.phase !== 'gameover'" class="puzzleHud">
            <div class="puzzleHudHeader">
              <span class="puzzleHudTitle">🧩 ZEN PUZZLE</span>
              <button class="puzzleFinishBtn" @click="handlePuzzleEnd">FINISH</button>
            </div>
            <div class="puzzleHudStats">
              <div class="puzzleHudStat">
                <span class="puzzleHudValue">{{ game.remaining?.[1]?.length ?? 0 }}</span>
                <span class="puzzleHudLabel">PIECES LEFT</span>
              </div>
              <div class="puzzleHudDivider"></div>
              <div class="puzzleHudStat">
                <span class="puzzleHudValue">{{ puzzleCellsCovered }}<span class="puzzleHudOf">/60</span></span>
                <span class="puzzleHudLabel">CELLS COVERED</span>
              </div>
              <div class="puzzleHudDivider"></div>
              <div class="puzzleHudStat">
                <span class="puzzleHudValue">{{ Math.round(puzzleCellsCovered / 60 * 100) }}<span class="puzzleHudOf">%</span></span>
                <span class="puzzleHudLabel">COMPLETE</span>
              </div>
            </div>
            <div class="puzzleProgressBar">
              <div class="puzzleProgressFill" :style="{ width: (puzzleCellsCovered / 60 * 100) + '%' }"></div>
            </div>
          </div>

          <DraftPanel v-if="game.phase === 'draft'" />

          <section v-else class="panel">
            <h2 class="panelTitle" v-if="screen !== 'puzzle'">{{ screen === 'ai' && game.phase === 'place' && game.currentPlayer === aiPlayer ? 'AI Pieces' : `Player ${game.currentPlayer} Pieces` }}</h2>
            <PiecePicker :isOnline="isOnline" :myPlayer="myPlayer" :canAct="canAct" />

            <div class="divider"></div>
            <Controls :isOnline="isOnline" :canAct="canAct" />
          </section>
        </section>

        <section class="rightPanel">
          <Board :isOnline="isOnline" :myPlayer="myPlayer" :canAct="canAct" :adjacencyHint="showAdjacencyHint" />
        </section>

        <!-- ── STORY TAUNT BUBBLE — absolute inside gameLayout, escapes panelHead stacking context ── -->
        <Transition name="storyTauntBubble">
          <div
            v-if="storyTaunt.visible && storyMode.active && screen === 'ai'"
            class="storyTauntWrap"
            :style="{ '--ch-color': storyTaunt.color }"
          >
            <div class="storyTauntTail" aria-hidden="true"></div>
            <div class="storyTauntCard">
              <span class="storyTauntChip">
                <span class="storyTauntEmoji">{{ storyTaunt.emoji }}</span>
                <span class="storyTauntName">{{ storyTaunt.charName }}</span>
              </span>
              <span class="storyTauntText">{{ storyTaunt.text }}</span>
            </div>
          </div>
        </Transition>

      </section>

    <!-- ══════════════════════════════════════════════════════════
         AUTH MODAL — Login / Create Account
    ═══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="authFade">
        <div v-if="authModal.open" class="authOverlay" role="dialog" aria-modal="true" aria-label="Sign in">

          <div class="authCard">
            <!-- Accent stripe -->
            <div class="authStripe"></div>

            <div class="authInner">
              <!-- Header -->
              <div class="authHead">
                <div class="authIconDot"></div>
                <div class="authTitle">{{ authModal.mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT' }}</div>
                <button class="authClose" @click="closeAuthModal" aria-label="Close">✕</button>
              </div>

              <!-- Mode toggle tabs -->
              <div class="authTabs">
                <button class="authTab" :class="{ active: authModal.mode === 'login' }" @click="authModal.mode = 'login'; authModal.error = ''">
                  LOGIN
                </button>
                <button class="authTab" :class="{ active: authModal.mode === 'signup' }" @click="authModal.mode = 'signup'; authModal.error = ''">
                  CREATE ACCOUNT
                </button>
              </div>

              <!-- Form -->
              <div class="authForm">
                <!-- Username (signup only) -->
                <Transition name="authField">
                  <label v-if="authModal.mode === 'signup'" class="authField">
                    <span>USERNAME <span class="authFieldHint">(your in-game name)</span></span>
                    <input
                      v-model="authModal.username"
                      class="authInput"
                      type="text"
                      placeholder="e.g. PentoKing99"
                      autocomplete="username"
                      maxlength="20"
                      @keydown.enter="submitAuth"
                    />
                  </label>
                </Transition>

                <label class="authField">
                  <span>EMAIL</span>
                  <input
                    v-model="authModal.email"
                    class="authInput"
                    type="email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    @keydown.enter="submitAuth"
                  />
                </label>

                <label class="authField">
                  <span>PASSWORD <span v-if="authModal.mode === 'signup'" class="authFieldHint">(min 6 characters)</span></span>
                  <input
                    v-model="authModal.password"
                    class="authInput"
                    type="password"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    @keydown.enter="submitAuth"
                  />
                </label>

                <!-- Error -->
                <Transition name="authField">
                  <div v-if="authModal.error" class="authError">⚠ {{ authModal.error }}</div>
                </Transition>

                <!-- Submit -->
                <button
                  class="authSubmit"
                  :class="{ loading: authModal.loading }"
                  :disabled="authModal.loading"
                  @click="submitAuth"
                >
                  <span v-if="authModal.loading" class="authSpinner"></span>
                  <span v-else>{{ authModal.mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT' }}</span>
                </button>
              </div>


            </div>
          </div>

        </div>
      </Transition>
    </Teleport>

    </div><!-- end pageWrap -->

    <!-- ── Custom YouTube Video Modal ── -->
    <Teleport to="body">
      <Transition name="ytModalFade">
        <div v-if="ytModalOpen" class="ytModalOverlay" @click.self="closeYtModal" role="dialog" aria-modal="true" aria-label="Watch Tutorial">
          <div class="ytModalContainer">
            <button class="ytModalClose" @click="closeYtModal" aria-label="Close video">
              <span class="ytModalCloseIcon">✕</span>
              <span class="ytModalCloseLabel">CLOSE</span>
            </button>
            <div class="ytModalFrame">
              <iframe
                v-if="ytModalOpen"
                class="ytModalIframe"
                src="https://www.youtube.com/embed/Iqr3XIhSnUQ?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&end=11"
                title="PENTObattle trailer"
                frameborder="0"
                allow="autoplay; encrypted-media"
                allowfullscreen
              ></iframe>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ════════════════════════════════════════════════════════════
         FRIENDS SIDEBAR  (slides in from the right)
    ═══════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="pbSidebar">
        <div v-if="friendsSidebarOpen" class="pbSidebarOverlay" @click.self="friendsSidebarOpen = false" aria-label="Friends panel">
          <div class="pbSidebar pbFriendsSidebar">
            <div class="pbSidebarHead">
              <div class="pbSidebarHeadLeft">
                <span class="pbSidebarTitle">PEOPLE</span>
                <span class="pbSidebarStatus">
                  <span class="pbSidebarStatusDot"></span>
                  {{ loggedIn ? 'IN MENUS' : 'NOT SIGNED IN' }}
                </span>
              </div>
              <button class="pbSidebarClose" @click="friendsSidebarOpen = false" aria-label="Close">✕</button>
            </div>

            <div class="pbSidebarSearch">
              <input
                class="pbSidebarSearchInput"
                type="text"
                placeholder="Find someone..."
                v-model="friendSearch"
                @input="onFriendSearchInput"
                @keydown.enter="runFriendSearch"
                maxlength="32"
                autocomplete="off"
                spellcheck="false"
              />
              <button class="pbSidebarSearchBtn" @click="runFriendSearch" :disabled="friendSearchLoading" aria-label="Search">
                <svg v-if="!friendSearchLoading" viewBox="0 0 18 18" fill="none" class="pbSearchBtnIcon">
                  <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M12 12l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                <span v-else class="pbSearchBtnSpinner"></span>
              </button>
            </div>

            <!-- Search results panel (shown when there's a query) -->
            <template v-if="friendSearchQuery">
              <div class="pbSearchResultsHeader">
                <span class="pbSearchResultsLabel">
                  {{ friendSearchResults.length > 0 ? `${friendSearchResults.length} result${friendSearchResults.length !== 1 ? 's' : ''}` : 'No results found' }}
                </span>
                <button class="pbSearchClear" @click="clearFriendSearch">✕ CLEAR</button>
              </div>
              <div class="pbRequestList">
                <div v-for="result in friendSearchResults" :key="result.id" class="pbSearchResultRow">
                  <img :src="guestAvatarUrl" class="pbRequestAvatar" alt="Avatar" />
                  <div class="pbRequestInfo">
                    <span class="pbRequestName">{{ result.display_name || result.username }}</span>
                    <span class="pbRequestSub">{{ result.uid ? '#' + result.uid : '' }}</span>
                  </div>
                  <button
                    class="pbAddFriendBtn"
                    v-if="result.friendStatus === 'none'"
                    @click="sendFriendRequest(result.id)"
                    :disabled="result.sending"
                    title="Send friend request"
                  >
                    <svg viewBox="0 0 18 18" fill="none" class="pbAddFriendIcon">
                      <circle cx="7" cy="6" r="4" stroke="currentColor" stroke-width="1.6"/>
                      <path d="M1 16c0-4 2.686-7 6-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                      <path d="M13 11v4M11 13h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <span class="pbFriendStatusTag" v-else-if="result.friendStatus === 'pending_sent'">SENT</span>
                  <span class="pbFriendStatusTag pbFriendStatusFriends" v-else-if="result.friendStatus === 'friends'">FRIENDS</span>
                  <span class="pbFriendStatusTag pbFriendStatusYou" v-else-if="result.friendStatus === 'self'">YOU</span>
                </div>
              </div>
            </template>

            <div class="pbSidebarTabs">
              <button class="pbSidebarTab" :class="{ active: friendTab === 'online' }" @click="friendTab = 'online'">ONLINE</button>
              <button class="pbSidebarTab" :class="{ active: friendTab === 'all' }" @click="friendTab = 'all'">ALL</button>
              <button class="pbSidebarTab" :class="{ active: friendTab === 'requests' }" @click="friendTab = 'requests'">
                REQUESTS
                <span class="pbSidebarTabBadge" v-if="friendRequests.length > 0">{{ friendRequests.length }}</span>
              </button>
            </div>

            <!-- ONLINE / ALL tab: friend list or empty state -->
            <template v-if="friendTab === 'online' || friendTab === 'all'">
              <div v-if="friendsList.length === 0" class="pbSidebarEmpty">
                <div class="pbSidebarEmptyArt">
                  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="pbSidebarEmptyArtSvg">
                    <circle cx="32" cy="26" r="14" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
                    <path d="M6 68c0-14.912 11.640-27 26-27s26 12.088 26 27" stroke="rgba(255,255,255,0.12)" stroke-width="3" stroke-linecap="round"/>
                    <circle cx="60" cy="26" r="10" stroke="rgba(255,255,255,0.08)" stroke-width="2.5"/>
                    <path d="M70 68c0-10.493-5.373-19.845-13.6-25.433" stroke="rgba(255,255,255,0.08)" stroke-width="2.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <p class="pbSidebarEmptyText">You haven't added any friends yet.<br />Click the <b>FRIEND</b> button on a profile<br />to friend them.</p>
              </div>
              <div v-else class="pbRequestList">
                <div v-for="f in (friendTab === 'online' ? friendsList.filter(x => x.online) : friendsList)" :key="f.friend_id" class="pbRequestRow">
                  <div class="pbFriendAvatarWrap">
                    <img :src="guestAvatarUrl" class="pbRequestAvatar" alt="Avatar" />
                    <span class="pbFriendStatusDot" :class="f.online ? 'online' : 'offline'"></span>
                  </div>
                  <div class="pbRequestInfo">
                    <span class="pbRequestName">{{ f.name }}</span>
                    <span class="pbRequestSub" :class="f.online ? 'pbFriendOnlineTag' : 'pbFriendOfflineTag'">
                      {{ f.online ? '● ONLINE' : '● OFFLINE' }}
                    </span>
                  </div>
                  <div class="pbFriendActionBtns">
                    <!-- View Profile -->
                    <button class="pbFriendActionBtn" title="View Profile" @click="viewFriendProfile(f)">
                      <svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M2 17c0-4.418 3.134-8 7-8s7 3.582 7 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                    </button>
                    <!-- Challenge (only if online) -->
                    <button class="pbFriendActionBtn pbFriendChallengeBtn" title="Challenge" v-if="f.online" @click="showModal({ title: 'Challenge', message: 'Challenges coming soon!', tone: 'info' })">
                      <svg viewBox="0 0 18 18" fill="none"><path d="M9 2l1.8 5.4H17l-4.9 3.6 1.9 5.8L9 13.4l-5 3.4 1.9-5.8L1 7.4h6.2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                    </button>
                    <!-- Message -->
                    <button class="pbFriendActionBtn" title="Message" @click="openChat(f)">
                      <svg viewBox="0 0 18 18" fill="none"><rect x="1" y="3" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M1 6l8 5 8-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- REQUESTS tab -->
            <template v-else-if="friendTab === 'requests'">
              <div v-if="friendRequests.length === 0" class="pbSidebarEmpty">
                <div class="pbSidebarEmptyArt">
                  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="pbSidebarEmptyArtSvg">
                    <circle cx="36" cy="28" r="14" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
                    <path d="M8 70c0-14.912 12.536-27 28-27" stroke="rgba(255,255,255,0.12)" stroke-width="3" stroke-linecap="round"/>
                    <path d="M58 46v14M51 53h14" stroke="rgba(255,255,255,0.18)" stroke-width="3" stroke-linecap="round"/>
                  </svg>
                </div>
                <p class="pbSidebarEmptyText">No pending friend requests.</p>
              </div>
              <div v-else class="pbRequestList">
                <div
                  v-for="req in friendRequests"
                  :key="req.id"
                  class="pbRequestRow"
                >
                  <img :src="guestAvatarUrl" class="pbRequestAvatar" alt="Avatar" />
                  <div class="pbRequestInfo">
                    <span class="pbRequestName">{{ req.name }}</span>
                    <span class="pbRequestSub">sent you a friend request</span>
                  </div>
                  <div class="pbRequestActions">
                    <button class="pbRequestBtn pbRequestAccept" @click="acceptFriendRequest(req.id)" title="Accept">✓</button>
                    <button class="pbRequestBtn pbRequestDecline" @click="declineFriendRequest(req.id)" title="Decline">✕</button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ════════════════════════════════════════════════════════════
         NOTIFICATIONS SIDEBAR  (slides in from the right)
    ═══════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="pbSidebarRight">
        <div v-if="notifSidebarOpen" class="pbSidebarOverlay pbSidebarOverlayRight" @click.self="notifSidebarOpen = false" aria-label="Notifications panel">
          <div class="pbSidebar pbNotifSidebar">
            <div class="pbSidebarHead">
              <div class="pbSidebarHeadLeft">
                <span class="pbSidebarTitle">NOTIFICATIONS</span>
              </div>
              <button class="pbSidebarClose" @click="notifSidebarOpen = false" aria-label="Close">✕</button>
            </div>

            <div class="pbSidebarEmpty">
              <div class="pbSidebarEmptyArt">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="pbSidebarEmptyArtSvg">
                  <path d="M40 8a24 24 0 0 0-24 24v16l-8 8v4h64v-4l-8-8V32A24 24 0 0 0 40 8z" stroke="rgba(255,255,255,0.12)" stroke-width="3" stroke-linejoin="round"/>
                  <path d="M32 72a8 8 0 0 0 16 0" stroke="rgba(255,255,255,0.12)" stroke-width="3" stroke-linecap="round"/>
                </svg>
              </div>
              <p class="pbSidebarEmptyText">Notifications will appear here.</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ════════════════════════════════════════════════════════════
         PROFILE MODAL  (TETR.IO quick-profile style)
    ═══════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="pbProfileModal">
        <div v-if="profileModalOpen" class="pbProfileOverlay" @click.self="profileModalOpen = false" role="dialog" aria-modal="true" aria-label="Profile">
          <div class="pbProfileCard">

            <!-- Accent bar -->
            <div class="pbProfileAccentBar"></div>

            <!-- Header row -->
            <div class="pbProfileHead">
              <div class="pbProfileAvatarBlock">
                <img :src="guestAvatarUrl" class="pbProfileAvatar" alt="Avatar" />
              </div>
              <div class="pbProfileMeta">
                <div class="pbProfileName">
                  {{ displayName }}
                  <span class="pbProfileFlag">🇵🇭</span>
                </div>
                <div class="pbProfileJoined">JOINED RECENTLY</div>
                <button
                  v-if="memberStats.uid"
                  class="pbProfileUid"
                  @click="copyUid"
                  :title="uidCopied ? 'Copied!' : 'Click to copy UID'"
                >
                  <span class="pbProfileUidHash">#</span>{{ memberStats.uid }}
                  <span class="pbProfileUidCopyIcon">{{ uidCopied ? '✓' : '⎘' }}</span>
                </button>
              </div>
              <button class="pbProfileClose" @click="profileModalOpen = false" aria-label="Close">CLOSE</button>
            </div>

            <!-- Mode ranks -->
            <div class="pbProfileModes">
              <div
                v-for="mode in profileModes"
                :key="mode.key"
                class="pbProfileModeRow"
              >
                <span class="pbProfileModeName">{{ mode.label }}</span>
                <span
                  class="pbProfileModeTier"
                  :class="'pbModeTier-' + (memberStats[mode.tierKey] || 'unranked')"
                >
                  {{ tierDisplayName(memberStats[mode.tierKey]) }}
                </span>
              </div>
            </div>

            <!-- View profile button -->
            <button class="pbProfileViewBtn" @click="onViewFullProfile">
              ↗ VIEW FULL PROFILE
            </button>

          </div>
        </div>
      </Transition>
    </Teleport>

    </main>

    <!-- ── Unified drag ghost: board-cell-sized blocks that follow the cursor.
         Outside the board → free-floating with piece colour.
         Over the board   → hidden (board's own green/red overlay takes over). ── -->
    <Teleport to="body">
      <div
        v-if="cursorGhostVisible"
        class="cursorGhost"
        :style="cursorGhostContainerStyle"
        aria-hidden="true"
      >
        <div
          v-for="(b, i) in cursorGhostBlocks"
          :key="i"
          class="cursorGhostBlock"
          :style="cursorGhostBlockStyle(b)"
        />
      </div>
    </Teleport>

    <!-- ════════════════════════════════════════════════════════════
         CHAT WINDOWS  (floating, bottom-left, LoL-style)
    ═══════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <div
        class="pbChatDock"
        v-if="loggedIn"
        :style="friendsSidebarOpen ? 'left: calc(340px + 12px)' : 'left: 12px'"
      >
        <TransitionGroup name="pbChatWin">
          <div
            v-for="chat in openChats"
            :key="chat.friendId"
            class="pbChatWindow"
            :class="{ minimized: chat.minimized }"
          >
            <!-- LoL-style title bar -->
            <div class="pbChatTitleBar" @click="chat.minimized = !chat.minimized">
              <div class="pbChatTitleLeft">
                <div class="pbChatTitleAvatarWrap">
                  <img :src="guestAvatarUrl" class="pbChatTitleAvatar" alt="" />
                  <span class="pbChatTitleDot" :class="onlineUserIds?.has(chat.friendId) ? 'online' : 'offline'"></span>
                </div>
                <div class="pbChatTitleMeta">
                  <span class="pbChatTitleName">{{ chat.friendName }}</span>
                  <span class="pbChatTitleStatus" :class="onlineUserIds?.has(chat.friendId) ? 'online' : 'offline'">
                    {{ onlineUserIds?.has(chat.friendId) ? '● Online' : '● Offline' }}
                  </span>
                </div>
              </div>
              <div class="pbChatTitleActions" @click.stop>
                <button class="pbChatTitleBtn" @click="chat.minimized = !chat.minimized" :title="chat.minimized ? 'Expand' : 'Minimize'">
                  <svg viewBox="0 0 10 10" fill="none" style="width:10px;height:10px">
                    <path v-if="!chat.minimized" d="M2 7l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <path v-else d="M2 3l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
                <button class="pbChatTitleBtn pbChatCloseBtn" @click="closeChat(chat.friendId)" title="Close">✕</button>
              </div>
            </div>

            <!-- Message area (hidden when minimized) -->
            <template v-if="!chat.minimized">
              <div class="pbChatMessages" :ref="el => { if (el) chatScrollRefs[chat.friendId] = el }">
                <div v-if="chat.loading" class="pbChatLoading">
                  <span class="pbChatSpinner"></span>
                </div>
                <div v-else-if="chat.messages.length === 0" class="pbChatEmpty">
                  Say hi to <b>{{ chat.friendName }}</b>!
                </div>
                <template v-else>
                  <!-- Date separator -->
                  <div class="pbChatDateSep">Today</div>
                  <div
                    v-for="(msg, msgIdx) in chat.messages"
                    :key="msg.id"
                    class="pbChatMsg"
                    :class="msg.from_id === myUserId ? 'pbChatMsgMe' : 'pbChatMsgThem'"
                  >
                    <div class="pbChatBubble">{{ msg.content }}</div>
                    <div class="pbChatMsgMeta">
                      <span class="pbChatMsgTime">{{ chatFormatTime(msg.created_at) }}</span>
                      <span
                        v-if="msg.from_id === myUserId"
                        class="pbChatMsgStatus"
                        :class="chatMsgStatusClass(msg, msgIdx, chat)"
                      >{{ chatMsgStatusText(msg, msgIdx, chat) }}</span>
                    </div>
                  </div>
                </template>
              </div>

              <!-- Input -->
              <div class="pbChatInputRow">
                <input
                  class="pbChatInput"
                  type="text"
                  placeholder="Type here..."
                  v-model="chat.draft"
                  @keydown.enter="sendMessage(chat)"
                  maxlength="500"
                />
                <button class="pbChatSendBtn" @click="sendMessage(chat)" :disabled="!chat.draft.trim()">
                  <svg viewBox="0 0 18 18" fill="none"><path d="M2 9l14-7-6 7 6 7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </template>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

<!-- Menu-style bottom bar (menus) -->
<!-- TETR.IO-style contextual status bar -->
<footer v-if="showBottomBar" class="tetBottomBar" :class="{ mnBottomBar: ['mode','multiplayer','solo'].includes(screen), vsaiBottomBarBar: screen === 'story', stBottomBar: ['settings','credits'].includes(screen), lbBottomBar: screen === 'lobby' }" :style="screen === 'mode' ? { '--mn-bottombar-img': `url(${menuBottombarUrl})` } : screen === 'multiplayer' ? { '--mn-bottombar-img': `url(${mpBottombarUrl})` } : screen === 'solo' ? { '--mn-bottombar-img': `url(${soloBottombarUrl})` } : screen === 'story' ? { '--vsai-bottombar-img': `url(${vsaiBottombarUrl})` } : screen === 'settings' ? { '--st-bottombar-img': `url(${settingsBottombarUrl})` } : screen === 'credits' ? { '--st-bottombar-img': `url(${creditsBottombarUrl})` } : screen === 'lobby' ? { '--lb-bottombar-img': `url(${lobbyBottombarNewUrl})` } : {}">

  <!-- LEFT side -->
  <template v-if="['settings','credits','lobby'].includes(screen)">
    <div class="scBottomLeft">
      <img :src="menuLogoUrl" class="scBottomLogo" alt="" />
      <img :src="menuTitleUrl" class="scBottomTitle" alt="PENTObattle" />
    </div>
  </template>
  <template v-else>
    <span class="tetBottomText">{{ bottomStatusText }}</span>
  </template>

  <!-- RIGHT side -->
  <div class="tetBottomRight">
    <template v-if="['mode','multiplayer','solo'].includes(screen)">
      <img :src="menuAuthorUrl" class="mnBottomAuthor" alt="MUMUCHXM" />
    </template>
    <template v-else-if="['settings','credits','lobby'].includes(screen)">
      <span class="tetBottomText scBottomText">{{ bottomStatusText }}</span>
    </template>
    <template v-else>
      <img :src="logoUrl" alt="" class="tetBottomLogo" />
      <span class="tetBottomMadeByText">MADE BY MUMUCHXM</span>
    </template>
  </div>
</footer>


    <!-- ✅ Modal -->
    <div v-if="modal.open" class="modalOverlay" :class="{ resultOverlay: isResultModal, victoryOverlay: modal.tone === 'victory', defeatOverlay: modal.tone === 'bad' && isResultModal }" @click.self="!modal.locked && closeModal()">

      <!-- Confetti layer (victory only) -->
      <div v-if="showConfetti" class="confetti" aria-hidden="true">
        <span
          v-for="p in confettiPieces"
          :key="p.id"
          class="confettiPiece"
          :style="{ left: p.left + '%', '--d': p.delay + 's', '--t': p.dur + 's', '--r': p.rot + 'deg', '--x': p.drift + 'px', width: p.size + 'px', height: (p.size * 0.6) + 'px' }"
        />
      </div>

      <!-- ══ RESULT MODAL (Victory / Defeat / Player Wins) ══ -->
      <div v-if="isResultModal" class="resultModal" :class="resultHeroClass" role="dialog" aria-modal="true">
        <!-- Background aura rings -->
        <div class="rmAura rmAura1" aria-hidden="true"></div>
        <div class="rmAura rmAura2" aria-hidden="true"></div>
        <!-- Scanline overlay -->
        <div class="rmScanlines" aria-hidden="true"></div>

        <!-- Big stamp -->
        <div class="rmStampWrap">
          <div class="rmStamp">{{ resultBigTitle }}</div>
          <div class="rmStampShadow" aria-hidden="true">{{ resultBigTitle }}</div>
        </div>

        <!-- Sub label -->
        <div v-if="resultSubTitle" class="rmSub">{{ resultSubTitle }}</div>

        <!-- Divider -->
        <div class="rmDivider" aria-hidden="true"></div>

        <!-- Message lines -->
        <div class="rmBody">
          <template v-for="(line, i) in modalLines" :key="i">
            <p
              v-if="modal.diffTier !== null && line.startsWith('Difficulty:')"
              class="rmMsg rmDiffBadge"
              :class="'rmDiffTier' + modal.diffTier"
            >{{ line }}</p>
            <p v-else class="rmMsg">{{ line }}</p>
          </template>
        </div>

        <!-- Actions -->
        <div class="rmActions">
          <button
            v-for="(a, i) in modal.actions"
            :key="i"
            class="rmBtn"
            :class="{ rmBtnPrimary: a.tone === 'primary', rmBtnSoft: a.tone === 'soft' }"
            @mouseenter="uiHover"
            @click="uiClick(); onModalAction(a)"
          >
            {{ a.label }}
          </button>
        </div>
      </div>

      <!-- ══ STANDARD MODAL ══ -->
      <div v-else class="modalCard" :class="modalCardClass" role="dialog" aria-modal="true">
        <div class="modalStripe" :class="modalDotClass" aria-hidden="true"></div>
        <div class="modalInner">
          <div class="modalHead">
            <div class="modalIconDot" :class="modalDotClass" aria-hidden="true"></div>
            <div class="modalTitle2">{{ modal.title }}</div>
          </div>
          <div class="modalBody">
            <p class="modalMsg" v-for="(line, i) in modalLines" :key="i">{{ line }}</p>
          </div>
          <div class="modalActions">
            <button
              v-for="(a, i) in modal.actions"
              :key="i"
              class="btn"
              :class="{ primary: a.tone === 'primary', soft: a.tone === 'soft', ghost: a.tone === 'ghost' }"
              @mouseenter="uiHover"
              @click="uiClick(); onModalAction(a)"
            >{{ a.label }}</button>
          </div>
        </div>
      </div>
    </div>

    
    <!-- ✅ Quick Match Accept Modal -->
    <div v-if="qmAccept.open" class="modalOverlay" aria-live="polite" aria-busy="true">
      <div class="modalCard qmCard" :class="{ dangerPulse: qmAccept.pulse }" role="dialog" aria-modal="true">
        <div class="modalStripe" :class="qmAccept.pulse ? 'bad' : 'info'" aria-hidden="true"></div>
        <div class="modalInner">
          <div class="modalHead">
            <div class="modalIconDot" :class="qmAccept.pulse ? 'bad' : 'info'"></div>
            <div class="modalTitle2">MATCH FOUND</div>
          </div>

          <div class="modalBody">
            <p class="modalMsg">Opponent found. Accept within <b>{{ Math.ceil(qmAccept.remainingMs / 1000) }}</b>s.</p>

            <!-- Countdown ring + bar combo -->
            <div class="qmTimerArea">
              <svg class="qmRing" viewBox="0 0 56 56" aria-hidden="true">
                <circle class="qmRingTrack" cx="28" cy="28" r="22"/>
                <circle class="qmRingFill" :class="{ danger: qmAccept.pulse }" cx="28" cy="28" r="22"
                  :style="{ strokeDashoffset: 138.2 * (1 - qmAccept.progress) }"/>
              </svg>
              <div class="qmRingNum" :class="{ danger: qmAccept.pulse }">{{ Math.ceil(qmAccept.remainingMs / 1000) }}</div>
            </div>

            <div class="qmBar" :class="{ danger: qmAccept.pulse }" role="progressbar" aria-valuemin="0" aria-valuemax="10" :aria-valuenow="Math.max(0, Math.round(qmAccept.remainingMs/1000))">
              <div class="qmBarFill" :style="{ width: (qmAccept.progress * 100) + '%' }"></div>
            </div>

            <p v-if="qmAccept.statusLine" class="modalMsg muted">{{ qmAccept.statusLine }}</p>
          </div>

          <div class="modalActions">
            <button class="btn soft" @mouseenter="uiHover" @click="uiClick(); qmDecline()" aria-label="Decline">DECLINE</button>
            <button class="btn primary" @mouseenter="uiHover" @click="uiClick(); qmAcceptClick()" :disabled="qmAccept.myAccepted" aria-label="Accept">ACCEPT</button>
          </div>
        </div>
      </div>
    </div>

<!-- ✅ PENTwelve — Pre-fight cinematic -->
    <Transition name="fcFightFade">
      <div v-if="storyFight.active" class="fcFightOverlay" :class="`fcTierOverlay${storyFight.chapter?.tier ?? 0}`" :style="{ '--ch-color': storyFight.chapter?.color || '#fff' }">
        <!-- Animated background layers -->
        <div class="fcFightBg"></div>
        <div class="fcFightScanlines"></div>
        <div class="fcFightParticles">
          <div class="fcFightParticle" v-for="n in 12" :key="n" :style="{ '--i': n }"></div>
        </div>
        <div class="fcFightColorFlood"></div>

        <!-- Main card -->
        <div class="fcFightCard">
          <!-- Rank badge top -->
          <div class="fcFightRankRow">
            <div class="fcFightRankLabel">PENTWELVE</div>
            <div class="fcFightRankNum">RANK #{{ String(12 - storyFight.index).padStart(2,'0') }}</div>
          </div>

          <!-- Portrait zone -->
          <div class="fcFightPortrait">
            <div class="fcFightPortraitRing"></div>
            <div class="fcFightPortraitGlow"></div>
            <div class="fcFightPortraitEmoji">{{ storyFight.chapter?.emoji }}</div>
          </div>

          <!-- Identity -->
          <div class="fcFightName">{{ storyFight.chapter?.name }}</div>
          <div class="fcFightCharTitle">{{ storyFight.chapter?.title }}</div>

          <!-- Mode + diff badges -->
          <div class="fcFightBadges">
            <span class="fcModeBadge" :class="`fcMode${storyFight.chapter?.mode}`">
              {{ storyFight.chapter?.mode === 'normal' ? 'STANDARD' : storyFight.chapter?.mode === 'blind_draft' ? 'BLIND DRAFT' : 'MIRROR WAR' }}
            </span>
            <span class="fcDiffBadge" :class="`fcDiff${storyFight.chapter?.difficulty}`">
              {{ {easy:'EASY',normal:'NORMAL',hard:'HARD',master:'MASTER',expert:'EXPERT',ultimate:'ULTIMATE'}[storyFight.chapter?.difficulty] || storyFight.chapter?.difficulty?.toUpperCase() }}
            </span>
          </div>

          <!-- Divider -->
          <div class="fcFightDivider"></div>

          <!-- Pre-fight dialogue -->
          <div class="fcFightDialogue">
            <div
              v-for="(line, i) in storyFight.chapter?.preDialogue"
              :key="i"
              class="fcFightLine"
              :style="{ animationDelay: (0.5 + i * 0.22) + 's' }"
            >{{ line }}</div>
          </div>

          <!-- CTA -->
          <div class="fcFightActions">
            <button class="fcFightDeclineBtn" @mouseenter="uiHover" @click="uiClick(); declineStoryChapter()">
              <span>✕ DECLINE</span>
            </button>
            <button class="fcFightBeginBtn" @mouseenter="uiHover" @click="uiClick(); launchStoryChapterGame()">
              <span class="fcFightBeginText">ACCEPT THE CHALLENGE</span>
              <span class="fcFightBeginArrow">▶</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ✅ PENTwelve — Post-fight result -->
    <Transition name="fcFightFade">
      <div v-if="storyResult.active" class="fcResultOverlay"
        :class="storyResult.won ? 'fcResultOverlayWin' : 'fcResultOverlayLose'"
        :style="{ '--res-color': storyResult.chapterColor }"
        @click.self="closeStoryResult">

        <!-- Background layers -->
        <div class="fcResultBg"></div>
        <div class="fcResultParticles" v-if="storyResult.won">
          <div class="fcResultParticle" v-for="n in 16" :key="n" :style="{ '--i': n }"></div>
        </div>

        <!-- ── WIN STATE ───────────────────────────────────────── -->
        <div v-if="storyResult.won" class="fcResultCard fcResultWin">

          <!-- Top: eliminated label -->
          <div class="fcResultElimLabel">ELIMINATED</div>
          <div class="fcResultElimName" :style="{ color: storyResult.chapterColor }">
            {{ storyResult.chapterName }}
          </div>
          <div class="fcResultElimLine" :style="{ background: storyResult.chapterColor }"></div>

          <!-- Rank climb -->
          <div class="fcResultRankClimb">
            <div class="fcResultRankBefore">#{{ storyResult.chapterRank + 1 }}</div>
            <div class="fcResultRankArrow">→</div>
            <div class="fcResultRankAfter" :style="{ color: storyResult.nextChapter ? storyResult.nextChapter.color : '#ffd700' }">#{{ storyResult.chapterRank }}</div>
          </div>

          <!-- Quote from defeated opponent -->
          <div class="fcResultQuote">
            <span class="fcResultQuoteMark">"</span>{{ storyResult.quote }}<span class="fcResultQuoteMark">"</span>
          </div>

          <!-- Next opponent preview -->
          <div v-if="storyResult.nextChapter" class="fcResultNext"
            :style="{ '--next-color': storyResult.nextChapter.color }">
            <div class="fcResultNextHeader">NEXT OPPONENT</div>
            <div class="fcResultNextBody">
              <div class="fcResultNextEmoji">{{ storyResult.nextChapter.emoji }}</div>
              <div class="fcResultNextInfo">
                <div class="fcResultNextName">{{ storyResult.nextChapter.name }}</div>
                <div class="fcResultNextSub">{{ storyResult.nextChapter.title }}</div>
              </div>
              <div class="fcResultNextRank">#{{ storyResult.chapterRank - 1 }}</div>
            </div>
          </div>

          <!-- All clear -->
          <div v-if="!storyResult.nextChapter" class="fcResultChampion">
            <div class="fcResultChampionIcon">🏆</div>
            <div class="fcResultChampionText">PENTWELVE #1</div>
            <div class="fcResultChampionSub">You came from nothing. Now you are the standard.</div>
          </div>

          <div class="fcResultActions">
            <button v-if="storyResult.nextChapter"
              class="fcResultBtn fcResultBtnNext"
              :style="{ '--next-color': storyResult.nextChapter.color }"
              @mouseenter="uiHover" @click="closeStoryResult(); startStoryChapter(storyResult.nextIndex)">
              NEXT OPPONENT ▶
            </button>
            <button v-if="!storyResult.nextChapter"
              class="fcResultBtn fcResultBtnChamp"
              @mouseenter="uiHover" @click="closeStoryResult(); screen = 'story'">
              VIEW THE LIST 🏁
            </button>
            <button class="fcResultBtn fcResultBtnSoft"
              @click="closeStoryResult(); screen = 'story'">
              CIRCUIT LIST
            </button>
          </div>
        </div>

        <!-- ── LOSE STATE ──────────────────────────────────────── -->
        <div v-if="!storyResult.won" class="fcResultCard fcResultLose">

          <!-- Taunting header -->
          <div class="fcResultLoseHeader">
            <div class="fcResultLoseLabel">HELD RANK</div>
            <div class="fcResultLoseName" :style="{ color: storyResult.chapterColor }">
              {{ storyResult.chapterName }}
            </div>
          </div>

          <!-- "Not getting through" rank wall visual -->
          <div class="fcResultRankWall">
            <div class="fcResultRankWallNum" :style="{ color: storyResult.chapterColor }">#{{ storyResult.chapterRank }}</div>
            <div class="fcResultRankWallLabel">BLOCKED</div>
          </div>

          <!-- Quote -->
          <div class="fcResultQuote fcResultQuoteLose">
            <span class="fcResultQuoteMark">"</span>{{ storyResult.quote }}<span class="fcResultQuoteMark">"</span>
          </div>

          <div class="fcResultActions">
            <button class="fcResultBtn fcResultBtnRetry"
              :style="{ '--res-color': storyResult.chapterColor }"
              @mouseenter="uiHover" @click="closeStoryResult(); startStoryChapter(storyResult.chapterIndex)">
              TRY AGAIN ↺
            </button>
            <button class="fcResultBtn fcResultBtnSoft"
              @click="closeStoryResult(); screen = 'story'">
              CIRCUIT LIST
            </button>
          </div>
        </div>

      </div>
    </Transition>


    <!-- ✅ Unlock Animation Overlay -->
    <Transition name="unlockFade">
      <div v-if="unlockAnim.active" class="unlockOverlay">
        <div class="unlockBurst"></div>
        <div class="unlockCard" :class="`unlockTier${['easy','normal','hard','master','expert','ultimate'].indexOf(unlockAnim.rank)}`">
          <div class="unlockGlowRing"></div>
          <div class="unlockEmoji">
            {{ unlockAnim.rank === 'normal' ? '🔵' : unlockAnim.rank === 'hard' ? '🟣' : unlockAnim.rank === 'master' ? '🟠' : '🔴' }}
          </div>
          <div class="unlockLabel">NEW RANK UNLOCKED</div>
          <div class="unlockRankName">
            {{ unlockAnim.rank === 'easy' ? 'EASY' : unlockAnim.rank === 'normal' ? 'NORMAL' : unlockAnim.rank === 'hard' ? 'HARD' : unlockAnim.rank === 'master' ? 'MASTER' : unlockAnim.rank === 'expert' ? 'EXPERT' : 'ULTIMATE' }}
          </div>
          <div class="unlockRankDesc">
            {{ unlockAnim.rank === 'normal' ? 'Sharpened Strategist' : unlockAnim.rank === 'hard' ? 'Master of Patterns' : unlockAnim.rank === 'master' ? 'The Territorial God' : 'Beyond Human Reach' }}
          </div>
          <div class="unlockActions">
            <button class="unlockBtn unlockBtnSoft"  @click="onUnlockMainMenu">Main Menu</button>
            <button class="unlockBtn unlockBtnSecondary" @click="onUnlockPlayAgain">Play Again</button>
            <button class="unlockBtn unlockBtnPrimary" @click="onUnlockNextBattle">Next Battle</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ✅ Challenge Animation Overlay (shown when master replays any difficulty) -->
    <Transition name="unlockFade">
      <div v-if="challengeAnim.active" class="unlockOverlay" @click="closeChallengeAnim">
        <div class="unlockBurst"></div>
        <div class="challengeCard" :class="`unlockTier${['easy','normal','hard','master','expert','ultimate'].indexOf(challengeAnim.rank)}`">
          <div class="unlockGlowRing"></div>
          <div class="challengeSwords">⚔️</div>
          <div class="challengeLabel">YOU'RE UP AGAINST</div>
          <div class="unlockRankName">{{ RANK_LABELS[challengeAnim.rank] || challengeAnim.rank?.toUpperCase() }}</div>
          <div class="unlockRankDesc">{{ RANK_DESC[challengeAnim.rank] || '' }}</div>
          <div class="unlockTapBegin">Tap to begin</div>
        </div>
      </div>
    </Transition>

    <!-- ✅ Legendary Conquered Animation (shown when player beats Legendary) -->
    <Transition name="unlockFade">
      <div v-if="legendaryConqueredAnim.active" class="unlockOverlay lcOverlay">
        <div class="lcBurst lcBurst1"></div>
        <div class="lcBurst lcBurst2"></div>
        <div class="lcBurst lcBurst3"></div>
        <div class="lcStars">
          <span v-for="i in 18" :key="i" class="lcStar" :style="`--i:${i};`">★</span>
        </div>
        <div class="lcCard">
          <div class="lcGlowRing"></div>
          <div class="lcCrown">👑</div>
          <div class="lcSuperLabel">ALL STAGES CLEARED</div>
          <div class="lcTitle">ULTIMATE<br>CONQUERED</div>
          <div class="lcDivider"></div>
          <div class="lcQuote">"Beyond Human Reach —<br>You proved them wrong."</div>
          <div class="unlockActions" style="margin-top:28px;">
            <button class="unlockBtn unlockBtnSoft" @click="onLcMainMenu">Main Menu</button>
            <button class="unlockBtn lcBtnPlayAgain" @click="onLcPlayAgain">Play Again</button>
          </div>
        </div>
      </div>
    </Transition>

<!-- ✅ In-game Settings Modal (Esc) -->
    <div v-if="inGameSettingsOpen" class="modalOverlay" @click.self="closeInGameSettings">
      <div class="modalCard" role="dialog" aria-modal="true">
        <div class="modalStripe info" aria-hidden="true"></div>
        <div class="modalInner">
          <div class="modalHead">
            <div class="modalIconDot info"></div>
            <div class="modalTitle2">SETTINGS</div>
          </div>

          <div class="modalBody">
            <div class="form">
            <label class="field">
              <span>BGM Volume</span>
              <input type="range" min="0" max="100" step="1" v-model.number="bgmVolumeUi" />
              <b class="mono">{{ bgmVolumeUi }}%</b>
            </label>

            <label class="field">
              <span>SFX Volume</span>
              <input type="range" min="0" max="100" step="1" v-model.number="sfxVolumeUi" />
              <b class="mono">{{ sfxVolumeUi }}%</b>
            </label>

            <label class="field fieldToggle">
              <span>
                <b>Verify Move</b>
                <span class="fieldDesc">Show Submit button — confirm placement before committing</span>
              </span>
              <button
                class="toggleBtn"
                :class="{ active: game.ui?.requireSubmit }"
                @click="game.ui.requireSubmit = !game.ui.requireSubmit"
                :aria-pressed="game.ui?.requireSubmit"
              >
                <span class="toggleThumb"></span>
              </button>
            </label>

          </div>
          </div>

          <div class="modalActions">
            <button class="btn primary" @mouseenter="uiHover" @click="uiClick(); closeInGameSettings()">Close</button>
          </div>
        </div>
      </div>
    </div>

  <!-- ── Page transition curtain bars ── -->
  <div class="pageCurtainTop" :class="{ active: pageBlackActive }" :style="{ background: curtainColorTop }" aria-hidden="true"></div>
  <div class="pageCurtainBot" :class="{ active: pageBlackActive }" :style="{ background: curtainColorBot }" aria-hidden="true"></div>

  <!-- ── Global back/logout — at root level to escape .main overflow stacking context ── -->
  <div class="gNavOverlay" aria-hidden="false">
    <button v-if="screen === 'mode' && loggedIn" class="figmaNavBtn figmaLogoutBtn" @mouseenter="uiHover" @click="uiClick(); confirmLogOut()" aria-label="Log Out">
      <img :src="logoutBtnUrl" class="figmaNavBtnImg" alt="LOG OUT" />
    </button>
    <button v-else-if="screen === 'mode' && !loggedIn" class="figmaNavBtn figmaBackBtn" @mouseenter="uiHover" @click="uiClick(); navTo('auth')" aria-label="Back">
      <img :src="backBtnUrl" class="figmaNavBtnImg" alt="BACK" />
    </button>
    <button v-else-if="['multiplayer','solo','lobby','settings','credits'].includes(screen)" class="figmaNavBtn figmaBackBtn" @mouseenter="uiHover" @click="uiClick(); goBack()" aria-label="Back">
      <img :src="backBtnUrl" class="figmaNavBtnImg" alt="BACK" />
    </button>
  </div>

  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useGameStore, randomSplitPieces } from "./store/game";
import { supabase as sbRealtime } from "./lib/supabase";
import { getPieceStyle } from "./lib/pieceStyles";
import { boundsOf, transformCells } from "./lib/geom";
import { PENTOMINOES } from "./lib/pentominoes";
import { createAiEngine } from "./lib/aiEngine.js";

// ── Floating pentomino pieces: DVD-bounce physics ──────────────────────────
const LANDING_CELL = 42;
const bouncingPieces = ref([]);
let _physicsRaf = null;

// Per-cell MTV: finds MAXIMUM overlap (deepest penetration) across all colliding cell pairs.
// Using max (not min) gives the true separation needed to fully resolve the collision.
function _cellsOverlapMTV(a, b) {
  const C = LANDING_CELL;
  let maxOvX = 0, maxOvY = 0;
  let found = false;
  for (const [ar, ac] of a.cells) {
    const alx = a.x + ac * C, arx = alx + C;
    const aty = a.y + ar * C, aby = aty + C;
    for (const [br, bc] of b.cells) {
      const blx = b.x + bc * C, brx = blx + C;
      const bty = b.y + br * C, bby = bty + C;
      if (alx < brx && arx > blx && aty < bby && aby > bty) {
        found = true;
        const ox = Math.min(arx - blx, brx - alx);
        const oy = Math.min(aby - bty, bby - aty);
        if (ox > maxOvX) maxOvX = ox;
        if (oy > maxOvY) maxOvY = oy;
      }
    }
  }
  return found ? { ox: maxOvX, oy: maxOvY } : null;
}

function _initPiecePhysics() {
  const pieceEntries = Object.entries(PENTOMINOES);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const count = pieceEntries.length; // exactly 12 — one per shape
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const [key, cells] = pieceEntries[i];
    const s  = (i * 13 + 7)  % 97;
    const s2 = (i * 31 + 11) % 89;
    const rows = Math.max(...cells.map(c => c[0])) + 1;
    const cols = Math.max(...cells.map(c => c[1])) + 1;
    const svgW = cols * LANDING_CELL;
    const svgH = rows * LANDING_CELL;
    const x = ((s * 173 + s2 * 37) % Math.max(1, vw - svgW));
    const y = ((s2 * 97  + s  * 53) % Math.max(1, vh - svgH));
    const speed = 0.3 + (s % 26) / 100;
    const angle = ((s * 47 + s2 * 83) % 360) * Math.PI / 180;
    pieces.push({
      key, cells, svgW, svgH,
      color: getPieceStyle(key).color,
      opacity: 0.13 + (s % 22) / 100,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  bouncingPieces.value = pieces;
}

function _tickPhysics() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pieces = bouncingPieces.value;

  // Move all pieces
  for (const p of pieces) {
    p.x += p.vx;
    p.y += p.vy;
    // Wall bounce
    if (p.x <= 0)           { p.x = 0;           p.vx =  Math.abs(p.vx); }
    if (p.y <= 0)           { p.y = 0;           p.vy =  Math.abs(p.vy); }
    if (p.x + p.svgW >= vw) { p.x = vw - p.svgW; p.vx = -Math.abs(p.vx); }
    if (p.y + p.svgH >= vh) { p.y = vh - p.svgH; p.vy = -Math.abs(p.vy); }
  }

  // Per-cell shape collision
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j];
      // Broad phase: skip pairs whose bounding boxes don't overlap
      if (a.x + a.svgW <= b.x || b.x + b.svgW <= a.x) continue;
      if (a.y + a.svgH <= b.y || b.y + b.svgH <= a.y) continue;
      // Narrow phase: per-cell check with max-overlap MTV
      const mtv = _cellsOverlapMTV(a, b);
      if (!mtv) continue;

      if (mtv.ox < mtv.oy) {
        // Collision on X axis — separate and reflect vx
        const sep = mtv.ox + 1;
        const aLeft = a.x < b.x;
        if (aLeft) { a.x -= sep / 2; b.x += sep / 2; }
        else        { a.x += sep / 2; b.x -= sep / 2; }
        // Only reflect if approaching — negate each piece's vx so they bounce away
        const approaching = aLeft ? (a.vx > b.vx) : (a.vx < b.vx);
        if (approaching) {
          a.vx = aLeft ? -Math.abs(a.vx) : Math.abs(a.vx);
          b.vx = aLeft ?  Math.abs(b.vx) : -Math.abs(b.vx);
        }
      } else {
        // Collision on Y axis — separate and reflect vy
        const sep = mtv.oy + 1;
        const aAbove = a.y < b.y;
        if (aAbove) { a.y -= sep / 2; b.y += sep / 2; }
        else         { a.y += sep / 2; b.y -= sep / 2; }
        // Only reflect if approaching
        const approaching = aAbove ? (a.vy > b.vy) : (a.vy < b.vy);
        if (approaching) {
          a.vy = aAbove ? -Math.abs(a.vy) : Math.abs(a.vy);
          b.vy = aAbove ?  Math.abs(b.vy) : -Math.abs(b.vy);
        }
      }
    }
  }

  _physicsRaf = requestAnimationFrame(_tickPhysics);
}

onMounted(() => {
  _initPiecePhysics();
  _physicsRaf = requestAnimationFrame(_tickPhysics);
});

onBeforeUnmount(() => {
  if (_physicsRaf) cancelAnimationFrame(_physicsRaf);
});
// Re-export the version string so the poll loop can embed it in state.meta
// and detect when two clients are running different builds.
const CLIENT_VERSION = "1.0.0";
// Track whether we've already shown the version-mismatch warning this session
// so it only fires once, not on every poll tick.
let _versionMismatchWarned = false;

// All 12 pentomino piece keys — used by Mirror War and Blind Draft modes
const ALL_PIECE_KEYS = ["F","I","L","P","N","T","U","V","W","X","Y","Z"];

import Board from "./components/Board.vue";
import DraftPanel from "./components/DraftPanel.vue";
import PiecePicker from "./components/PiecePicker.vue";
import Controls from "./components/Controls.vue";
import DevOverlay from "./components/DevOverlay.vue";
import { useDevMode, checkDevStatus } from "./lib/devMode.js";


const game = useGameStore();

// FIX: stagePlacement() never clears an existing pendingPlace when called on an
// invalid cell — so the Submit button stays green on bad taps. Intercept and
// force-clear on failure.
game.$onAction(({ name, after }) => {
  if (name === "stagePlacement") {
    after((result) => {
      if (!result) game.$patch({ pendingPlace: null });
    });
  }
});

// FIX: clearSelection() resets rotation/flipped to 0/false, losing the user's
// orientation when a dragged piece is dropped outside the board on mobile.
// Save and restore rotation+flip so the piece re-appears in the tray unchanged.
game.$onAction(({ name, after }) => {
  if (name === "clearSelection") {
    const savedRotation = game.rotation;
    const savedFlipped  = game.flipped;
    after(() => {
      if (savedRotation !== 0 || savedFlipped) {
        game.$patch({ rotation: savedRotation, flipped: savedFlipped });
      }
    });
  }
});

const screen = ref("landing");
const loggedIn = ref(false);

// ── Dev mode (only available to accounts with is_dev=true in pb_profiles) ──
const { isDevUser, devModeActive, toggleDevMode } = useDevMode();

// ✅ Seed auth state from any persisted session on startup, then keep it live.
// This runs once — the subscription in onMounted() handles future changes.
import("./lib/auth.js").then(async ({ isLoggedIn, getCurrentPlayerName, onAuthChange }) => {
  // Check for an existing session (e.g. after a page refresh)
  loggedIn.value = await isLoggedIn();
  if (loggedIn.value) {
    guestName.value = await getCurrentPlayerName();
    await checkDevStatus(); // check dev role on startup
    ensureMyUserId();       // eagerly cache user ID so chat bubbles align correctly
    loadFriendData();       // load friends/requests for existing session
  }

  // React to future sign-in / sign-out events
  onAuthChange(async ({ event, session }) => {
    loggedIn.value = !!session;
    guestName.value = await getCurrentPlayerName();
    await checkDevStatus(); // re-check dev role on every auth change
    if (session) ensureMyUserId(); // refresh user ID on new login
  });
}).catch(() => { /* Supabase not configured — stay logged out */ });
// ─── Auth modal state ───────────────────────────────────────────────────────
const authModal = reactive({
  open: false,
  mode: "login",         // "login" | "signup"
  email: "",
  password: "",
  username: "",
  error: "",
  loading: false,
});

function openAuthModal(mode = "login") {
  authModal.mode = mode;
  authModal.email = "";
  authModal.password = "";
  authModal.username = "";
  authModal.error = "";
  authModal.loading = false;
  authModal.open = true;
}

function closeAuthModal() {
  if (authModal.loading) return;
  authModal.open = false;
}

async function submitAuth() {
  authModal.error = "";
  const email = (authModal.email || "").trim();
  const password = authModal.password || "";
  const username = (authModal.username || "").trim();

  if (!email)    { authModal.error = "Email is required."; return; }
  if (!password) { authModal.error = "Password is required."; return; }
  if (authModal.mode === "signup" && !username) { authModal.error = "Username is required."; return; }
  if (authModal.mode === "signup" && username.length < 3) { authModal.error = "Username must be at least 3 characters."; return; }
  if (password.length < 6) { authModal.error = "Password must be at least 6 characters."; return; }

  authModal.loading = true;
  try {
    const { signIn, signUp } = await import("./lib/auth.js");
    const fn = authModal.mode === "signup" ? signUp : signIn;
    const args = authModal.mode === "signup"
      ? [email, password, username]
      : [email, password];

    const { session, error } = await fn(...args);

    if (error) {
      // Make Supabase error messages friendlier
      const msg = error.message || String(error);
      if (msg.includes("Invalid login credentials"))  authModal.error = "Wrong email or password.";
      else if (msg.includes("Email not confirmed"))   authModal.error = "Check your email to confirm your account.";
      else if (msg.includes("already registered") || msg.includes("User already registered")) authModal.error = "That email already has an account. Try logging in.";
      else authModal.error = msg;
      return;
    }

    if (authModal.mode === "signup" && !session) {
      // Email confirmation required
      authModal.open = false;
      showModal({ title: "Check Your Email", tone: "good", message: "We sent you a confirmation link. Click it to activate your account, then log in." });
      return;
    }

    // Success — loggedIn and displayName update via onAuthChange listener
    authModal.open = false;
    uiClick();
    screen.value = "mode";
  } catch (e) {
    authModal.error = e?.message || "Something went wrong. Try again.";
  } finally {
    authModal.loading = false;
  }
}

async function doSignOut() {
  const { signOut } = await import("./lib/auth.js");
  await signOut();
  screen.value = "auth";
}

function confirmLogOut() {
  uiClick();
  showModal({
    title: "LOG OUT",
    tone: "bad",
    message: "Are you sure you want to log out?",
    actions: [
      { label: "CANCEL",  tone: "soft",    onClick: () => closeModal() },
      { label: "LOG OUT", tone: "primary",  onClick: async () => { closeModal(); await doSignOut(); navTo("auth"); } },
    ],
  });
}
// ────────────────────────────────────────────────────────────────────────────

// Fix 9 — use a computed that delegates through game.setAllowFlip() so toggling
// the checkbox while a flipped piece is staged correctly resets the flip state.
const allowFlip = computed({
  get: () => game.allowFlip,
  set: (v) => game.setAllowFlip(v),
});

/* ══════════════════════════════════════════════════════
   TOPBAR SOCIAL PANEL STATE
   Friends sidebar, Notifications sidebar, Profile modal
══════════════════════════════════════════════════════ */
const friendsSidebarOpen = ref(false);
const notifSidebarOpen   = ref(false);
const profileModalOpen   = ref(false);
const friendTab          = ref('all');
const friendSearch       = ref('');
const friendsOnlineCount = ref(0);
const unreadNotifCount   = ref(0);

// Friend requests from Supabase
const friendRequests  = ref([]);   // [{ id, from_id, name }]
const friendsList     = ref([]);   // [{ id, friend_id, name, online }]
const onlineUserIds   = ref(new Set()); // set of user UUIDs currently online
let _friendsSubscription = null;
let _presenceChannel     = null;

async function loadFriendData() {
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { getUser }  = await import('./lib/auth.js');
    const user = await getUser();
    if (!user || !supabase) return;

    // ── Pending incoming requests ──────────────────────────
    const { data: reqData } = await supabase
      .from('pb_friend_requests')
      .select('id, from_id, status')
      .eq('to_id', user.id)
      .eq('status', 'pending');

    if (reqData && reqData.length > 0) {
      const fromIds = reqData.map(r => r.from_id);
      const { data: profiles } = await supabase
        .from('pb_profiles')
        .select('id, username, display_name')
        .in('id', fromIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.display_name || p.username || 'Unknown']));
      friendRequests.value = reqData.map(r => ({ id: r.id, from_id: r.from_id, name: profileMap[r.from_id] || 'Unknown' }));
    } else {
      friendRequests.value = [];
    }

    // ── Accepted friendships ────────────────────────────────
    const { data: accepted } = await supabase
      .from('pb_friend_requests')
      .select('id, from_id, to_id')
      .or(`from_id.eq.${user.id},to_id.eq.${user.id}`)
      .eq('status', 'accepted');

    if (accepted && accepted.length > 0) {
      const friendIds = accepted.map(r => r.from_id === user.id ? r.to_id : r.from_id);
      const { data: fProfiles } = await supabase
        .from('pb_profiles')
        .select('id, username, display_name')
        .in('id', friendIds);
      const fpMap = Object.fromEntries((fProfiles || []).map(p => [p.id, p.display_name || p.username || 'Unknown']));
      friendsList.value = accepted.map(r => {
        const fid = r.from_id === user.id ? r.to_id : r.from_id;
        return { id: r.id, friend_id: fid, name: fpMap[fid] || 'Unknown', online: onlineUserIds.value.has(fid) };
      });
    } else {
      friendsList.value = [];
    }
    _syncOnlineCounts();

    // ── Realtime: watch incoming friend request changes ─────
    if (_friendsSubscription) supabase.removeChannel(_friendsSubscription);
    _friendsSubscription = supabase
      .channel('pb_friend_requests_incoming')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pb_friend_requests',
        filter: `to_id=eq.${user.id}`,
      }, () => { loadFriendData(); })
      .subscribe();

    // ── Presence: track who is online ──────────────────────
    _startPresence(supabase, user.id);

  } catch (e) { console.warn('loadFriendData error', e); }
}

function _syncOnlineCounts() {
  // Update online flag on each friend reactively
  friendsList.value.forEach(f => {
    f.online = onlineUserIds.value.has(f.friend_id);
  });
  friendsOnlineCount.value = friendsList.value.filter(f => f.online).length;
}

function _startPresence(supabase, myId) {
  if (_presenceChannel) supabase.removeChannel(_presenceChannel);
  _presenceChannel = supabase.channel('pb_online_presence', {
    config: { presence: { key: myId } },
  });
  _presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = _presenceChannel.presenceState();
      onlineUserIds.value = new Set(Object.keys(state));
      _syncOnlineCounts();
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      onlineUserIds.value = new Set([...onlineUserIds.value, key]);
      _syncOnlineCounts();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      const next = new Set(onlineUserIds.value);
      next.delete(key);
      onlineUserIds.value = next;
      _syncOnlineCounts();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _presenceChannel.track({ user_id: myId, online_at: new Date().toISOString() });
      }
    });
}

async function acceptFriendRequest(id) {
  try {
    const { supabase } = await import('./lib/supabase.js');
    await supabase.from('pb_friend_requests').update({ status: 'accepted' }).eq('id', id);
    await loadFriendData();
    showModal({ title: 'Friend Added!', message: 'You are now friends.', tone: 'good' });
  } catch {
    friendRequests.value = friendRequests.value.filter(r => r.id !== id);
  }
}

async function declineFriendRequest(id) {
  try {
    const { supabase } = await import('./lib/supabase.js');
    await supabase.from('pb_friend_requests').update({ status: 'declined' }).eq('id', id);
    friendRequests.value = friendRequests.value.filter(r => r.id !== id);
  } catch {
    friendRequests.value = friendRequests.value.filter(r => r.id !== id);
  }
}

// Load when user logs in, clear when they log out
watch(loggedIn, async (isIn) => {
  if (isIn) {
    await loadFriendData();
  } else {
    friendRequests.value = [];
    friendsList.value = [];
    friendsOnlineCount.value = 0;
    friendsSidebarOpen.value = false;
    notifSidebarOpen.value = false;
    try {
      const { supabase } = await import('./lib/supabase.js');
      if (_friendsSubscription) { supabase.removeChannel(_friendsSubscription); _friendsSubscription = null; }
      if (_presenceChannel)     { supabase.removeChannel(_presenceChannel);     _presenceChannel = null; }
    } catch {}
  }
}, { immediate: false });

/* ─── Friend search ──────────────────────────────────────── */
const friendSearchQuery   = ref('');   // committed query (after pressing search)
const friendSearchResults = ref([]);
const friendSearchLoading = ref(false);
let _searchDebounce = null;

function onFriendSearchInput() {
  // Live-clear results if the input is emptied
  if (!friendSearch.value.trim()) { clearFriendSearch(); }
}

function clearFriendSearch() {
  friendSearch.value      = '';
  friendSearchQuery.value = '';
  friendSearchResults.value = [];
}

async function runFriendSearch() {
  const q = (friendSearch.value || '').trim();
  if (!q) return;
  friendSearchQuery.value = q;
  friendSearchLoading.value = true;
  friendSearchResults.value = [];
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { getUser }  = await import('./lib/auth.js');
    const user = await getUser();

    // Names: partial case-insensitive match; UID: exact case-insensitive match
    const cleanUid = q.replace(/^#/, '');
    const { data, error } = await supabase
      .from('pb_profiles')
      .select('id, username, display_name, uid')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,uid.ilike.${cleanUid}`)
      .limit(20);

    if (error || !data) { friendSearchResults.value = []; return; }

    // Get current friend relationships to tag each result
    const { data: rels } = await supabase
      .from('pb_friend_requests')
      .select('id, from_id, to_id, status')
      .or(user ? `from_id.eq.${user.id},to_id.eq.${user.id}` : 'id.is.null');

    const relMap = {};
    (rels || []).forEach(r => {
      const other = r.from_id === user?.id ? r.to_id : r.from_id;
      if (r.status === 'accepted') relMap[other] = 'friends';
      else if (r.status === 'pending' && r.from_id === user?.id) relMap[other] = 'pending_sent';
      else if (r.status === 'pending' && r.to_id === user?.id) relMap[other] = 'pending_recv';
    });

    friendSearchResults.value = data.map(p => ({
      ...p,
      friendStatus: p.id === user?.id ? 'self' : (relMap[p.id] || 'none'),
      sending: false,
    }));
  } catch (e) {
    console.warn('friend search error', e);
  } finally {
    friendSearchLoading.value = false;
  }
}

async function sendFriendRequest(targetId) {
  const result = friendSearchResults.value.find(r => r.id === targetId);
  if (result) result.sending = true;
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { getUser }  = await import('./lib/auth.js');
    const user = await getUser();
    if (!user) return;
    const { error } = await supabase
      .from('pb_friend_requests')
      .insert({ from_id: user.id, to_id: targetId, status: 'pending' });
    if (!error && result) result.friendStatus = 'pending_sent';
  } catch (e) {
    console.warn('sendFriendRequest error', e);
  } finally {
    if (result) result.sending = false;
  }
}

/* ─── Profile page ───────────────────────────────────────── */
const profileTab = ref('overview');
const profileTabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'stats',    label: 'Stats'    },
  { key: 'friends',  label: 'Friends'  },
  { key: 'awards',   label: 'Awards'   },
];

// When set, the profile screen shows this friend's data instead of the logged-in player's
const viewingFriendId   = ref(null);  // uuid or null = own profile
const viewingFriendData = ref(null);  // { name, uid, wins, losses, ranked_tier, ranked_lp, ... }

async function viewFriendProfile(friend) {
  friendsSidebarOpen.value = false;
  viewingFriendId.value   = friend.friend_id;
  viewingFriendData.value = null; // will load on screen enter
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { data } = await supabase
      .from('pb_profiles')
      .select('id, username, display_name, uid, wins, losses, draws, ranked_lp, ranked_tier, ranked_wins, ranked_losses, ranked_peak_lp, placement_games, win_streak')
      .eq('id', friend.friend_id)
      .single();
    if (data) viewingFriendData.value = { ...data, name: data.display_name || data.username || 'Unknown' };
  } catch (e) { console.warn('viewFriendProfile error', e); }
  navTo('profile');
}
const uidCopied = ref(false);
let _uidCopyTimer = null;
function copyUid() {
  const uid = memberStats.uid;
  if (!uid) return;
  try {
    navigator.clipboard.writeText('#' + uid);
    uidCopied.value = true;
    clearTimeout(_uidCopyTimer);
    _uidCopyTimer = setTimeout(() => { uidCopied.value = false; }, 2000);
  } catch {
    uidCopied.value = false;
  }
}

/* ─── Direct Messages (chat windows) ────────────────────── */
const openChats       = ref([]);   // [{ friendId, friendName, messages, draft, loading, minimized, sub }]
const chatScrollRefs  = {};
const myUserId        = ref(null); // set after login

// Get current user id once and cache it
async function ensureMyUserId() {
  if (myUserId.value) return myUserId.value;
  try {
    const { getUser } = await import('./lib/auth.js');
    const user = await getUser();
    myUserId.value = user?.id ?? null;
    return myUserId.value;
  } catch { return null; }
}

async function openChat(friend) {
  // Do NOT close the friends sidebar — chat is independent
  const existing = openChats.value.find(c => c.friendId === friend.friend_id);
  if (existing) {
    existing.minimized = false;
    return;
  }
  // Use reactive() so Vue tracks mutations on the object (e.g. chat.loading = false)
  const { reactive: vReactive } = await import('vue');
  const chat = vReactive({
    friendId:   friend.friend_id,
    friendName: friend.name,
    messages:   [],
    draft:      '',
    loading:    true,
    minimized:  false,
    sub:        null,
  });
  // Cap at 3 open windows
  if (openChats.value.length >= 3) openChats.value.shift()?.sub?.unsubscribe?.();
  openChats.value.push(chat);
  await loadChatHistory(chat);
  subscribeChatRealtime(chat);
}

function closeChat(friendId) {
  const idx = openChats.value.findIndex(c => c.friendId === friendId);
  if (idx === -1) return;
  const chat = openChats.value[idx];
  chat.sub?.unsubscribe?.();
  if (chat._pollTimer) clearInterval(chat._pollTimer);
  openChats.value.splice(idx, 1);
}

async function loadChatHistory(chat) {
  chat.loading = true;
  try {
    const { supabase } = await import('./lib/supabase.js');
    const uid = await ensureMyUserId();
    if (!uid || !supabase) return;

    const { data } = await supabase
      .from('pb_messages')
      .select('id, from_id, to_id, content, created_at, read')
      .or(`and(from_id.eq.${uid},to_id.eq.${chat.friendId}),and(from_id.eq.${chat.friendId},to_id.eq.${uid})`)
      .order('created_at', { ascending: true })
      .limit(100);

    chat.messages = data || [];
    // Mark unread messages as read
    const unread = (data || []).filter(m => m.to_id === uid && !m.read).map(m => m.id);
    if (unread.length > 0) {
      supabase.from('pb_messages').update({ read: true }).in('id', unread).then(() => {});
    }
    await nextTickScrollChat(chat.friendId);
  } catch (e) { console.warn('loadChatHistory error', e); }
  finally { chat.loading = false; }
}

function subscribeChatRealtime(chat) {
  (async () => {
    try {
      const { supabase } = await import('./lib/supabase.js');
      const uid = await ensureMyUserId();
      if (!uid || !supabase) return;

      // Use Broadcast (no RLS/replica-identity config needed) for real-time delivery.
      // Channel name is deterministic and shared between both participants.
      const channelName = `pb_chat_${[uid, chat.friendId].sort().join('_')}`;
      const channel = supabase
        .channel(channelName)
        .on('broadcast', { event: 'new_message' }, ({ payload: msg }) => {
          if (!msg) return;
          const isOurs = (msg.from_id === uid && msg.to_id === chat.friendId) ||
                         (msg.from_id === chat.friendId && msg.to_id === uid);
          if (!isOurs) return;
          if (!chat.messages.find(m => m.id === msg.id)) {
            chat.messages.push(msg);
            nextTickScrollChat(chat.friendId);
            if (msg.to_id === uid && !chat.minimized) {
              supabase.from('pb_messages').update({ read: true }).eq('id', msg.id).then(() => {});
            }
          }
        })
        .subscribe();

      chat.sub = channel;

      // Polling fallback every 4s: catches messages missed by broadcast
      chat._pollTimer = setInterval(async () => {
        try {
          const latest = chat.messages.at(-1);
          const since = latest?.created_at ?? new Date(0).toISOString();
          const { data } = await supabase
            .from('pb_messages')
            .select('id, from_id, to_id, content, created_at, read')
            .or(`and(from_id.eq.${uid},to_id.eq.${chat.friendId}),and(from_id.eq.${chat.friendId},to_id.eq.${uid})`)
            .gt('created_at', since)
            .order('created_at', { ascending: true });
          (data || []).forEach(msg => {
            if (!chat.messages.find(m => m.id === msg.id)) {
              chat.messages.push(msg);
              nextTickScrollChat(chat.friendId);
            }
          });
        } catch {}
      }, 4000);

    } catch (e) { console.warn('subscribeChatRealtime error', e); }
  })();
}

async function sendMessage(chat) {
  const content = chat.draft.trim();
  if (!content) return;
  chat.draft = '';
  const uid = await ensureMyUserId();
  if (!uid) return;
  // Optimistic push
  const tempMsg = { id: 'tmp_' + Date.now(), from_id: uid, to_id: chat.friendId, content, created_at: new Date().toISOString(), read: false };
  chat.messages.push(tempMsg);
  nextTickScrollChat(chat.friendId);
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { data, error } = await supabase
      .from('pb_messages')
      .insert({ from_id: uid, to_id: chat.friendId, content })
      .select()
      .single();
    if (!error && data) {
      const idx = chat.messages.findIndex(m => m.id === tempMsg.id);
      if (idx !== -1) chat.messages[idx] = data;
      // Broadcast via the already-subscribed channel — do NOT call supabase.channel()
      // again here as it creates a duplicate registration and leaks channels, which
      // can destabilise the shared WebSocket connection (breaks QM realtime sync).
      if (chat.sub?.send) {
        try {
          await chat.sub.send({ type: 'broadcast', event: 'new_message', payload: data });
        } catch {}
      }
    }
  } catch (e) { console.warn('sendMessage error', e); }
}

function nextTickScrollChat(friendId) {
  setTimeout(() => {
    const el = chatScrollRefs[friendId];
    if (el) el.scrollTop = el.scrollHeight;
  }, 30);
}

function chatFormatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  } catch { return ''; }
}

// Returns status label for a sent message: Sending → Sent → Delivered → Seen
function chatMsgStatusText(msg, msgIdx, chat) {
  if (msg.id?.startsWith('tmp_')) return 'Sending…';
  // Seen: recipient has read:true on this message (set when they open the chat)
  if (msg.read) return 'Seen';
  // Delivered: message has a real ID (confirmed in DB) and is the last message
  const myMsgs = chat.messages.filter(m => m.from_id === myUserId.value);
  const isLastMine = myMsgs.at(-1)?.id === msg.id;
  if (isLastMine) return 'Delivered';
  return 'Sent';
}

function chatMsgStatusClass(msg, msgIdx, chat) {
  if (msg.id?.startsWith('tmp_')) return 'pbChatStatusSending';
  if (msg.read) return 'pbChatStatusSeen';
  const myMsgs = chat.messages.filter(m => m.from_id === myUserId.value);
  const isLastMine = myMsgs.at(-1)?.id === msg.id;
  if (isLastMine) return 'pbChatStatusDelivered';
  return 'pbChatStatusSent';
}

// Clean up chats on logout
watch(loggedIn, (isIn) => {
  if (!isIn) {
    openChats.value.forEach(c => c.sub?.unsubscribe?.());
    openChats.value = [];
    myUserId.value = null;
  }
});

function toggleFriendsSidebar() {
  notifSidebarOpen.value = false;
  friendsSidebarOpen.value = !friendsSidebarOpen.value;
}
function toggleNotifSidebar() {
  friendsSidebarOpen.value = false;
  notifSidebarOpen.value = !notifSidebarOpen.value;
}
function openProfileModal() {
  friendsSidebarOpen.value = false;
  notifSidebarOpen.value   = false;
  profileModalOpen.value   = true;
}
function onViewFullProfile() {
  profileModalOpen.value = false;
  navTo('profile');
}

const profileModes = [
  { key: 'standard',   label: 'STANDARD',   tierKey: 'standard_tier'    },
  { key: 'mirrorwar',  label: 'MIRROR WAR', tierKey: 'mirror_war_tier'  },
  { key: 'blinddraft', label: 'BLIND DRAFT', tierKey: 'blind_draft_tier' },
];

function tierDisplayName(tier) {
  if (!tier) return 'UNRANKED';
  return tier.toUpperCase();
}
// Close panels on Escape
const _pbPanelEscHandler = (e) => {
  if (e.key !== 'Escape') return;
  if (profileModalOpen.value)   { profileModalOpen.value = false;   return; }
  if (friendsSidebarOpen.value) { friendsSidebarOpen.value = false; return; }
  if (notifSidebarOpen.value)   { notifSidebarOpen.value = false;   return; }
};


const guestName = ref("GUEST");
const displayName = computed(() => guestName.value);

/* =========================
   Menu SFX (no asset files)
========================= */
let _uiAudioCtx = null;
let _uiAudioUnlocked = false;

function uiUnlockAudio() {
  try {
    if (!_uiAudioCtx) _uiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_uiAudioCtx.state === "suspended") _uiAudioCtx.resume();
    _uiAudioUnlocked = true;
  } catch {}
}

function uiBeep({ freq = 700, dur = 0.03, gain = 0.03 } = {}) {
  try {
    uiUnlockAudio();
    if (!_uiAudioCtx) return;
    const ctx = _uiAudioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    const vol = Math.max(0, Math.min(1, Number(sfxVolume?.value ?? 1)));
    g.gain.value = gain * vol;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  } catch {}
}

function uiHover() {
  uiBeep({ freq: 760, dur: 0.025, gain: 0.02 });
}
function uiClick() {
  uiBeep({ freq: 420, dur: 0.04, gain: 0.03 });

  // Autoplay policies: start menu BGM only after a user gesture.
  if (showMenuChrome.value) tryPlayMenuBgm();
}

/* =========================
   ✅ IN-GAME SFX
   sfxPlayUrl  — plays pick.mp3 / place.mp3 from assets
   sfx*        — synthesized sounds via Web Audio (no asset files needed)
========================= */
const _sfxCache = {};
function sfxPlayUrl(url) {
  try {
    if (!url) return;
    const vol = Math.max(0, Math.min(1, Number(sfxVolume?.value ?? 1)));
    if (vol <= 0) return;
    if (!_sfxCache[url]) _sfxCache[url] = new Audio(url);
    const a = _sfxCache[url].cloneNode();
    a.volume = vol;
    a.play?.().catch?.(() => {});
  } catch {}
}

// In-game SFX — each function plays its corresponding asset file.
// Swap out the .wav files in /assets/audio/ to customise sounds.
function sfxDraftStart()   { sfxPlayUrl(sfxDraftStartUrl);   }
function sfxBattleStart()  { sfxPlayUrl(sfxBattleStartUrl);  }
function sfxVictory()      { sfxPlayUrl(sfxVictoryUrl);      }
function sfxDefeat()       { sfxPlayUrl(sfxDefeatUrl);       }
function sfxTurnChime()    { sfxPlayUrl(sfxTurnChimeUrl);    }
function sfxDraftTurn()    { sfxPlayUrl(sfxDraftTurnUrl);    }
function sfxInvalid()      { sfxPlayUrl(sfxInvalidUrl);      }
function sfxRotate()       { sfxPlayUrl(sfxRotateUrl);       }
function sfxFlip()         { sfxPlayUrl(sfxFlipUrl);         }
function sfxMatchFound()   { sfxPlayUrl(sfxMatchFoundUrl);   }
function sfxQmAlert()      { sfxPlayUrl(sfxQmAlertUrl);      }
function sfxTimerWarning() { sfxPlayUrl(sfxTimerWarningUrl); }
function sfxSurrender()    { sfxPlayUrl(sfxSurrenderUrl);    }
function sfxLastMove()     { sfxPlayUrl(sfxLastMoveUrl);     }

// Story character SFX
// sfxStoryAccept — plays when the challenge card appears (pre-fight overlay)
// sfxStoryWin    — plays when you beat the character
// sfxStoryLose   — plays when the character beats you
function sfxStoryAccept(id) { sfxPlayUrl(STORY_SFX[id]?.accept); }
function sfxStoryWin(id)    { sfxPlayUrl(STORY_SFX[id]?.win);    }
function sfxStoryLose(id)   { sfxPlayUrl(STORY_SFX[id]?.lose);   }

// Internal state for one-shot clock warnings (reset each turn)
const _sfxClockWarned = { 30: false, 10: false };
function _resetClockWarnings() { _sfxClockWarned[30] = false; _sfxClockWarned[10] = false; }


// Cross-platform: optional landscape lock for mobile
const isPortrait = ref(false);
function computeIsPortrait() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia) {
      isPortrait.value = window.matchMedia('(orientation: portrait)').matches;
      return;
    }
  } catch {}
  isPortrait.value = window.innerHeight > window.innerWidth;
}
const landscapeLockActive = computed(() => isInGame.value && !!game.ui?.lockLandscape && isPortrait.value);

// Mobile landscape hint on the auth screen: nudge users to zoom out + hide the
// URL bar so the full 1920px layout fits comfortably without manual fiddling.
const mobileAuthLandscapeHintDismissed = ref(false);
const mobileAuthLandscapeHint = computed(() => {
  if (screen.value !== 'auth') return false;
  if (mobileAuthLandscapeHintDismissed.value) return false;
  if (isPortrait.value) return false; // only in landscape
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    const small = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
    if (small && (navigator?.maxTouchPoints || 0) > 0) return true;
  } catch {}
  return false;
});

// Soft portrait suggestion (non-blocking, dismissable, shown once per session)
const portraitHintDismissed = ref(false);
function dismissPortraitHint() { portraitHintDismissed.value = true; }

const portraitSuggestionVisible = computed(() => {
  if (landscapeLockActive.value) return false; // hard lock overlay already shown
  if (portraitHintDismissed.value) return false;
  if (!isInGame.value) return false;
  if (!isPortrait.value) return false;
  // Only show on touch/mobile devices
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    const small = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
    if (small && (navigator?.maxTouchPoints || 0) > 0) return true;
  } catch {}
  return false;
});

// In-game settings modal (Esc)

const qmAccept = reactive({
  open: false,
  lobbyId: null,
  role: null, // "host" | "guest"
  expiresAt: 0,
  remainingMs: 0,
  progress: 1,
  pulse: false,
  myAccepted: false,
  statusLine: "",
  // internal outcome hints so the async accept loop can exit cleanly
  outcome: null, // "self_decline" | "self_timeout" | "opponent_not_accept" | null
  silentFail: false,
});

function closeQmAccept() {
  qmAccept.open = false;
  qmAccept.lobbyId = null;
  qmAccept.role = null;
  qmAccept.expiresAt = 0;
  qmAccept.remainingMs = 0;
  qmAccept.progress = 1;
  qmAccept.pulse = false;
  qmAccept.myAccepted = false;
  qmAccept.statusLine = "";
  qmAccept.outcome = null;
  qmAccept.silentFail = false;
}

async function qmAcceptClick() {
  if (!qmAccept.open || !qmAccept.lobbyId || qmAccept.myAccepted) return;
  qmAccept.myAccepted = true;
  qmAccept.statusLine = "Waiting for opponent…";
  try {
    await sbSetQuickMatchAccept(qmAccept.lobbyId, qmAccept.role, true);
  } catch {
    // If patch fails, allow re-click
    qmAccept.myAccepted = false;
    qmAccept.statusLine = "";
  }
}

async function qmDecline() {
  if (!qmAccept.open || !qmAccept.lobbyId) return;
  qmAccept.statusLine = "Declining…";
  try {
    await sbSetQuickMatchAccept(qmAccept.lobbyId, qmAccept.role, false);
  } catch {}

  // Tell the accept-loop (quickMatchAcceptFlow) to exit without showing its own modal.
  qmAccept.outcome = "self_decline";
  qmAccept.silentFail = true;

  // Best-effort cleanup so neither side gets stuck in a half-accepted room.
  try {
    await sbDeleteLobby(qmAccept.lobbyId);
  } catch {}

  // Close the overlay UI but keep outcome/silentFail so the accept-loop can read it.
  qmAccept.open = false;

  showModal({
    title: "Matchmaking",
    tone: "info",
    message: "You declined the matchmaking.",
    actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "mode") }],
  });
}

const inGameSettingsOpen = ref(false);
function openInGameSettings() {
  if (!isInGame.value) return;
  inGameSettingsOpen.value = true;
}
function closeInGameSettings() {
  inGameSettingsOpen.value = false;
}

// Remove fullscreen

// ── Global mouse position tracking (for click-select cursor ghost) ───────────
const mousePos = ref({ x: 0, y: 0 });
function onGlobalMouseMove(e) {
  mousePos.value = { x: e.clientX, y: e.clientY };
}

// ── Unified cursor-following drag ghost ─────────────────────────────────────
// Visible only while dragging AND cursor is NOT over the board (the board's own
// green/red ghostOverlay handles the on-board visual — this one covers everything else).
// Visible while:
// (a) dragging and cursor is NOT over the board, OR
// (b) a piece is click-selected (no drag) and cursor is NOT over the board
const cursorGhostVisible = computed(() => {
  if (!game.selectedPieceKey || game.phase !== 'place') return false;
  if (game.drag?.active) {
    // Drag mode: hide when board overlay takes over
    return !game.drag?.target?.inside;
  }
  // Click-select mode: show whenever piece is selected and not hovering board
  return !game.hoverCell;
});

const cursorGhostBlocks = computed(() => {
  if (!game.selectedPieceKey) return [];
  return (game.selectedCells || []).map(([x, y]) => ({ x, y }));
});

const _cgBounds = computed(() => {
  const cells = cursorGhostBlocks.value;
  if (!cells.length) return { w: 1, h: 1 };
  return boundsOf(cells.map(b => [b.x, b.y]));
});

const _cgCell = computed(() => {
  // Prefer the live board cell size; fall back to measuring a real cell from DOM
  if (game.boardCellPx > 0) return game.boardCellPx;
  const cell = document.querySelector('.board .cell');
  if (cell) return cell.getBoundingClientRect().width || 32;
  return 32;
});
const _cgGap = 2;

const cursorGhostContainerStyle = computed(() => {
  // Use drag coords during drag, raw mouse coords during click-select
  const cx = game.drag?.active ? (game.drag?.x ?? 0) : mousePos.value.x;
  const cy = game.drag?.active ? (game.drag?.y ?? 0) : mousePos.value.y;
  const cell = _cgCell.value;
  const gap = _cgGap;
  const cols = _cgBounds.value.w;
  const rows = _cgBounds.value.h;
  const totalW = cols * cell + (cols - 1) * gap;
  const totalH = rows * cell + (rows - 1) * gap;

  // On touch: float above finger; on mouse: center on cursor
  const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const offsetX = -totalW / 2;
  const offsetY = isTouch ? -(totalH + 18) : -totalH / 2;

  return {
    left: `${cx + offsetX}px`,
    top: `${cy + offsetY}px`,
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
    gridTemplateRows: `repeat(${rows}, ${cell}px)`,
    gap: `${gap}px`,
  };
});

function cursorGhostBlockStyle(b) {
  const s = getPieceStyle(game.selectedPieceKey || game.drag?.pieceKey || '');
  const cell = _cgCell.value;
  const bevel = Math.max(1, Math.round(cell * 0.02));
  const radius = Math.round(cell * 0.08);
  const base = {
    gridColumn: b.x + 1,
    gridRow: b.y + 1,
    borderRadius: `${radius}px`,
    border: '1px solid rgba(0,0,0,0.30)',
    boxShadow: `inset 0 -${bevel}px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 10px rgba(0,0,0,0.60), 0 1px 3px rgba(0,0,0,0.40)`,
  };
  if (s.skin) {
    return { ...base, backgroundImage: `url(${s.skin})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { ...base, backgroundColor: s.color };
}
// ──────────────────────────────────────────────────────────────────────────── — toggling removed per user request.

// Viewport sizing: we rely on responsive CSS + natural page scroll.
// Keep portrait detection for optional landscape lock UI.
const appRoot = ref(null);

function onViewportChange() {
  computeIsPortrait();
}


const logoUrl = new URL("./assets/logo.png", import.meta.url).href;
const guestAvatarUrl = new URL("./assets/guest_avatar.png", import.meta.url).href;

// ── Homepage / Auth screen assets (Figma HOMEPAGE kit) ─────────────────────
const hpLogoUrl         = new URL("./assets/hp_logo.png",          import.meta.url).href;
const hpTitleUrl        = new URL("./assets/hp_title.png",         import.meta.url).href;
const hpTaglineUrl      = new URL("./assets/hp_tagline.png",       import.meta.url).href;
const hpWatchTutorialUrl= new URL("./assets/hp_watch_tutorial.png",import.meta.url).href;
const playBtnUrl        = new URL("./assets/play_btn.png",          import.meta.url).href;

// YouTube modal state
const ytModalOpen = ref(false);

function openYtModal() {
  ytModalOpen.value = true;
}

function closeYtModal() {
  ytModalOpen.value = false;
}
const hpAuthorUrl       = new URL("./assets/hp_author.png",        import.meta.url).href;
const hpGuestBtnUrl     = new URL("./assets/hp_guest_btn.png",     import.meta.url).href;
const hpLoginBtnUrl     = new URL("./assets/hp_login_btn.png",     import.meta.url).href;
const hpAuthTopbarUrl   = new URL("./assets/hp_auth_topbar.png",   import.meta.url).href;
const hpAuthBottombarUrl= new URL("./assets/hp_auth_bottombar.png",import.meta.url).href;
const hpContinueBtnUrl  = new URL("./assets/hp_continue_btn.png",  import.meta.url).href;
// ── Figma nav buttons ─────────────────────────────────────────────────────────
const backBtnUrl        = new URL("./assets/back_btn.png",         import.meta.url).href;
const logoutBtnUrl      = new URL("./assets/logout_btn.png",       import.meta.url).href;
const standardBtnUrl    = new URL("./assets/standard_btn.png",     import.meta.url).href;
const mirrorwarBtnUrl   = new URL("./assets/mirrorwar_btn.png",    import.meta.url).href;
const blindraftBtnUrl   = new URL("./assets/blindraft_btn.png",    import.meta.url).href;
// ── VERSUS AI — PENTWELVE screen assets ───────────────────────────────────────
const vsaiTopbarUrl     = new URL("./assets/vsai/vsai_topbar.png",    import.meta.url).href;
const vsaiBottombarUrl  = new URL("./assets/vsai/vsai_bottombar.png", import.meta.url).href;
const vsaiPentwelveUrl  = new URL("./assets/vsai/PENTWELVE.png",      import.meta.url).href;
const vsaiLowerSixUrl   = new URL("./assets/vsai/LOWER SIX.png",      import.meta.url).href;
const vsaiUpperSixUrl   = new URL("./assets/vsai/UPPER SIX.png",      import.meta.url).href;
const vsaiCharUrls = {
  '01-zero':   new URL("./assets/vsai/01 - ZERO.png",   import.meta.url).href,
  '02-grand':  new URL("./assets/vsai/02 - GRAND.png",  import.meta.url).href,
  '03-mumu':   new URL("./assets/vsai/03 - MUMU.png",   import.meta.url).href,
  '04-axia':   new URL("./assets/vsai/04 - AXIA.png",   import.meta.url).href,
  '05-vlad':   new URL("./assets/vsai/05 - VLAD.png",   import.meta.url).href,
  '06-sefia':  new URL("./assets/vsai/06 - SEFIA.png",  import.meta.url).href,
  '07-lilica': new URL("./assets/vsai/07 - LILICA.png", import.meta.url).href,
  '08-teift':  new URL("./assets/vsai/08 - TEIFT.png",  import.meta.url).href,
  '09-ohmen':  new URL("./assets/vsai/09 - OHMEN.png",  import.meta.url).href,
  '10-norm':   new URL("./assets/vsai/10 - NORM.png",   import.meta.url).href,
  '11-cyano':  new URL("./assets/vsai/11 - CYANO.png",  import.meta.url).href,
  '12-dumbie': new URL("./assets/vsai/12 - DUMBIE.png", import.meta.url).href,
};
const menuTopbarUrl     = new URL("./assets/menu_topbar.png",      import.meta.url).href;
const menuBottombarUrl  = new URL("./assets/menu_bottombar.png",   import.meta.url).href;
const menuDuonlineBtnUrl  = new URL("./assets/menu_duonline_btn.png",  import.meta.url).href;
const menuSolonlineBtnUrl = new URL("./assets/menu_solonline_btn.png", import.meta.url).href;
const menuSettingsBtnUrl  = new URL("./assets/menu_settings_btn.png",  import.meta.url).href;
const menuCreditsBtnUrl   = new URL("./assets/menu_credits_btn.png",   import.meta.url).href;
const menuLogoUrl         = new URL("./assets/menu_logo.png",          import.meta.url).href;
const menuTitleUrl        = new URL("./assets/menu_title.png",         import.meta.url).href;
const menuAuthorUrl       = new URL("./assets/menu_author.png",        import.meta.url).href;

// ── Settings screen assets ────────────────────────────────────────────────
const settingsTopbarUrl   = new URL("./assets/settings_topbar.png",   import.meta.url).href;
const settingsBottombarUrl= new URL("./assets/settings_bottombar.png",import.meta.url).href;
const settingsTextUrl     = new URL("./assets/settings_text.png",     import.meta.url).href;

// ── Credits screen assets ─────────────────────────────────────────────────
const creditsTopbarUrl    = new URL("./assets/credits_topbar.png",    import.meta.url).href;
const creditsBottombarUrl = new URL("./assets/credits_bottombar.png", import.meta.url).href;
const creditsTextUrl      = new URL("./assets/credits_text.png",      import.meta.url).href;

// ── Lobby screen assets ───────────────────────────────────────────────────
const lobbyTopbarNewUrl   = new URL("./assets/lobby_topbar_new.png",  import.meta.url).href;
const lobbyBottombarNewUrl= new URL("./assets/lobby_bottombar_new.png",import.meta.url).href;
const lobbyTextUrl        = new URL("./assets/lobby_text.png",        import.meta.url).href;

// ── Multiplayer (DUOnline) screen assets ──────────────────────────────────
const mpTopbarUrl       = new URL("./assets/mp_topbar.png",       import.meta.url).href;
const mpBottombarUrl    = new URL("./assets/mp_bottombar.png",    import.meta.url).href;
const mpQuickBtnUrl     = new URL("./assets/mp_quick_btn.png",    import.meta.url).href;
const mpRankedBtnUrl    = new URL("./assets/mp_ranked_btn.png",   import.meta.url).href;
const mpLobbyBtnUrl     = new URL("./assets/mp_lobby_btn.png",    import.meta.url).href;
const mpLogoUrl         = new URL("./assets/mp_logo.png",         import.meta.url).href;
const mpTitleUrl        = new URL("./assets/mp_title.png",        import.meta.url).href;

// ── Solo (SOLOnline) screen assets ────────────────────────────────────────
const soloTopbarUrl     = new URL("./assets/solo_topbar.png",     import.meta.url).href;
const soloBottombarUrl  = new URL("./assets/solo_bottombar.png",  import.meta.url).href;
const soloVsAiBtnUrl    = new URL("./assets/solo_versus_ai_btn.png", import.meta.url).href;
const soloCouchBtnUrl   = new URL("./assets/solo_couch_btn.png",  import.meta.url).href;
const soloPuzzleBtnUrl  = new URL("./assets/solo_puzzle_btn.png", import.meta.url).href;
const soloLogoUrl       = new URL("./assets/solo_logo.png",       import.meta.url).href;
const soloTitleUrl      = new URL("./assets/solo_title.png",      import.meta.url).href;
// Split brand assets (replaceable):
// - ./assets/logo.png  (icon)
// - ./assets/title.png (PENTO BATTLE text)
const titleUrl = new URL("./assets/title.png", import.meta.url).href;
const useSplitBrandPng = ref(true); // toggle off to fall back to text title

// Extra replaceable menu PNG assets (safe placeholders included in /assets)
const welcomeUrl = new URL("./assets/welcome.png", import.meta.url).href;

// Top bar titles (replaceable)
const lobbyTopTitleUrl = new URL("./assets/lobby.png", import.meta.url).href;
const configTopTitleUrl = new URL("./assets/config.png", import.meta.url).href;

// Audio
// - Menu BGM (starts on first click due to autoplay restrictions)
// - Separate BGM for Couch/AI and Online matches
const menuBgmUrl = new URL("./assets/audio/bgm.mp3", import.meta.url).href;
const couchBgmUrl = new URL("./assets/audio/couch_bgm.mp3", import.meta.url).href;
const onlineBgmUrl = new URL("./assets/audio/online_bgm.mp3", import.meta.url).href;

// SFX asset files (replace each .wav with your own sound to customise)
const sfxPickUrl         = new URL("./assets/audio/pick.mp3",         import.meta.url).href;
const sfxPlaceUrl        = new URL("./assets/audio/place.mp3",        import.meta.url).href;
const sfxDraftStartUrl   = new URL("./assets/audio/draft_start.wav",  import.meta.url).href;
const sfxBattleStartUrl  = new URL("./assets/audio/battle_start.wav", import.meta.url).href;
const sfxVictoryUrl      = new URL("./assets/audio/victory.wav",      import.meta.url).href;
const sfxDefeatUrl       = new URL("./assets/audio/defeat.wav",       import.meta.url).href;
const sfxTurnChimeUrl    = new URL("./assets/audio/turn_chime.wav",   import.meta.url).href;
const sfxDraftTurnUrl    = new URL("./assets/audio/draft_turn.wav",   import.meta.url).href;
const sfxInvalidUrl      = new URL("./assets/audio/invalid.wav",      import.meta.url).href;
const sfxRotateUrl       = new URL("./assets/audio/rotate.wav",       import.meta.url).href;
const sfxFlipUrl         = new URL("./assets/audio/flip.wav",         import.meta.url).href;
const sfxMatchFoundUrl   = new URL("./assets/audio/match_found.wav",  import.meta.url).href;
const sfxQmAlertUrl      = new URL("./assets/audio/qm_alert.wav",     import.meta.url).href;
const sfxTimerWarningUrl = new URL("./assets/audio/timer_warning.wav",import.meta.url).href;
const sfxSurrenderUrl    = new URL("./assets/audio/surrender.wav",    import.meta.url).href;
const sfxLastMoveUrl     = new URL("./assets/audio/last_move.wav",    import.meta.url).href;

// Story character SFX — one set per character: accept / win / lose
// Drop your own .wav files in /assets/audio/ using these exact names.
const STORY_SFX = Object.fromEntries(
  ["dumbie","cyano","norm","ohmen","teift","lilica","sefia","vlad","axia","mumu","grand","zero"]
  .map(id => [id, {
    accept: new URL(`./assets/audio/story_${id}_accept.wav`, import.meta.url).href,
    win:    new URL(`./assets/audio/story_${id}_win.wav`,    import.meta.url).href,
    lose:   new URL(`./assets/audio/story_${id}_lose.wav`,   import.meta.url).href,
  }])
);

// Audio settings (0..100 UI)
const bgmVolumeUi = ref(100);
const sfxVolumeUi = ref(100);
const bgmVolume = computed(() => Math.max(0, Math.min(1, (Number(bgmVolumeUi.value) || 0) / 100)));
const sfxVolume = computed(() => Math.max(0, Math.min(1, (Number(sfxVolumeUi.value) || 0) / 100)));
function loadAudioPrefs() {
  try {
    const b = Number(localStorage.getItem("pb_bgm_vol"));
    const s = Number(localStorage.getItem("pb_sfx_vol"));
    if (Number.isFinite(b)) bgmVolumeUi.value = Math.max(0, Math.min(100, Math.round(b)));
    if (Number.isFinite(s)) sfxVolumeUi.value = Math.max(0, Math.min(100, Math.round(s)));
  } catch {}
}
function saveAudioPrefs() {
  try {
    localStorage.setItem("pb_bgm_vol", String(bgmVolumeUi.value));
    localStorage.setItem("pb_sfx_vol", String(sfxVolumeUi.value));
  } catch {}
}

// FIX: confirmMove was referenced in applySettings and game-start functions but
// the ref was never declared in App.vue (it only existed in app_script.js which
// is never imported). Declaring it here wires up the full stage→submit flow.
const confirmMove = ref(false);
function loadConfirmMovePref() {
  try { confirmMove.value = localStorage.getItem("pb_confirm_move") === "1"; } catch {}
}
function saveConfirmMovePref() {
  try { localStorage.setItem("pb_confirm_move", confirmMove.value ? "1" : "0"); } catch {}
}

let _menuBgm = null;
let _couchBgm = null;
let _onlineBgm = null;

function _attachLoopFix(audioEl) {
  try {
    if (!audioEl?.addEventListener) return;
    // Prevent double-binding if the app hot-reloads or mounts twice.
    if (audioEl.__pbLoopFixAttached) return;
    audioEl.__pbLoopFixAttached = true;
    audioEl.addEventListener("ended", () => {
      try {
        if (!audioEl.loop) return;
        audioEl.currentTime = 0;
        audioEl.play?.().catch?.(() => {});
      } catch {}
    });
  } catch {}
}

function ensureMenuBgm() {
  try {
    if (_menuBgm) return;
    // Use a window-global singleton so we never end up with 2 menu BGMs after remounts.
    const g = typeof window !== "undefined" ? window : null;
    if (g && g.__PB_MENU_BGM instanceof Audio) {
      _menuBgm = g.__PB_MENU_BGM;
    } else {
      _menuBgm = new Audio(menuBgmUrl);
      if (g) g.__PB_MENU_BGM = _menuBgm;
    }
    _menuBgm.loop = true;
    _menuBgm.preload = "auto";
    _menuBgm.volume = bgmVolume.value;
    _attachLoopFix(_menuBgm);
  } catch {
    _menuBgm = null;
  }
}

function ensureCouchBgm() {
  try {
    if (_couchBgm) return;
    const g = typeof window !== "undefined" ? window : null;
    if (g && g.__PB_COUCH_BGM instanceof Audio) {
      _couchBgm = g.__PB_COUCH_BGM;
    } else {
      _couchBgm = new Audio(couchBgmUrl);
      if (g) g.__PB_COUCH_BGM = _couchBgm;
    }
    _couchBgm.loop = true;
    _couchBgm.preload = "auto";
    _couchBgm.volume = bgmVolume.value;
    _attachLoopFix(_couchBgm);
  } catch {
    _couchBgm = null;
  }
}

function ensureOnlineBgm() {
  try {
    if (_onlineBgm) return;
    const g = typeof window !== "undefined" ? window : null;
    if (g && g.__PB_ONLINE_BGM instanceof Audio) {
      _onlineBgm = g.__PB_ONLINE_BGM;
    } else {
      _onlineBgm = new Audio(onlineBgmUrl);
      if (g) g.__PB_ONLINE_BGM = _onlineBgm;
    }
    _onlineBgm.loop = true;
    _onlineBgm.preload = "auto";
    _onlineBgm.volume = bgmVolume.value;
    _attachLoopFix(_onlineBgm);
  } catch {
    _onlineBgm = null;
  }
}

function tryPlayMenuBgm() {
  ensureMenuBgm();
  // Ensure only ONE BGM plays at a time.
  stopCouchBgm();
  stopOnlineBgm();
  try {
    if (!_menuBgm) return;
    if (isInGame.value) return;
    if (bgmVolume.value <= 0) return;
    if (!_menuBgm.paused) return;
    _menuBgm.play?.().catch?.(() => {});
  } catch {}
}

function stopMenuBgm() {
  try {
    if (!_menuBgm) return;
    _menuBgm.pause?.();
    _menuBgm.currentTime = 0;
  } catch {}
}

function stopCouchBgm() {
  try {
    if (!_couchBgm) return;
    _couchBgm.pause?.();
    _couchBgm.currentTime = 0;
  } catch {}
}

function stopOnlineBgm() {
  try {
    if (!_onlineBgm) return;
    _onlineBgm.pause?.();
    _onlineBgm.currentTime = 0;
  } catch {}
}

async function tryPlayGameBgm() {
  try {
    if (!isInGame.value) return;
    if (bgmVolume.value <= 0) return;

    // ensure menu bgm is off
    stopMenuBgm();

    if (isOnline.value) {
      ensureOnlineBgm();
      stopCouchBgm();
      if (_onlineBgm && _onlineBgm.paused) _onlineBgm.play?.().catch?.(() => {});
    } else {
      ensureCouchBgm();
      stopOnlineBgm();
      if (_couchBgm && _couchBgm.paused) _couchBgm.play?.().catch?.(() => {});
    }
  } catch {}
}
const loginTitleUrl = new URL("./assets/login.png", import.meta.url).href;
const loginIconUrl = new URL("./assets/login_icon.png", import.meta.url).href;
const playGuestTitleUrl = new URL("./assets/play_guest.png", import.meta.url).href;
const playGuestIconUrl = new URL("./assets/gs_icon.png", import.meta.url).href;

// MODE MENU replaceable PNGs (icons + titles)
const rkIconUrl = new URL("./assets/rk_icon.png", import.meta.url).href;
const rankedTitleUrl = new URL("./assets/ranked.png", import.meta.url).href;

const qmIconUrl = new URL("./assets/qm_icon.png", import.meta.url).href;
const quickMatchTitleUrl = new URL("./assets/quick_match.png", import.meta.url).href;

const lbIconUrl = new URL("./assets/lb_icon.png", import.meta.url).href;
const goLobbyTitleUrl = new URL("./assets/go_lobby.png", import.meta.url).href;

const onePIconUrl = new URL("./assets/onep_icon.png", import.meta.url).href;
const couchPlayTitleUrl = new URL("./assets/couch_play.png", import.meta.url).href;

const aiIconUrl = new URL("./assets/ai_icon.png", import.meta.url).href;
const practiceAiTitleUrl = new URL("./assets/practice_ai.png", import.meta.url).href;

// Toggle: replace specific menu texts with PNGs — disabled, using Orbitron text
// const useMenuPngs = ref(true);


const quick = reactive({
  lobbyName: "",
  isPrivate: false,
  joinCode: "",
});

const qmPickerOpen = ref(false);
const lobbyModeOption = ref("normal"); // "normal" | "mirror_war" | "blind_draft"
const couchPickerOpen = ref(false);
const couchMode = ref("normal"); // "normal" | "mirror_war" | "blind_draft"

const rankedTier = computed(() => {
  if (!loggedIn.value) return "—";
  const t = memberStats.ranked_tier || "unranked";
  if (t === "unranked") return "Placing…";
  return t.charAt(0).toUpperCase() + t.slice(1);
});

// Tier thresholds — lower LP bound of each tier.
// Must mirror pb_lp_to_tier() in the SQL trigger.
const TIER_THRESHOLDS = {
  plastic:  0,
  wood:     100,
  bronze:   250,
  silver:   450,
  gold:     700,
  platinum: 1000,
  diamond:  1350,
  master:   1750,
  champion: 2200,
};

/** Progress (0-100) within the current tier band for the LP bar. */
function lpBarPercent(lp, tier) {
  if (!tier || tier === "unranked") return 0;
  const floor = TIER_THRESHOLDS[tier] ?? 0;
  const tiers = Object.keys(TIER_THRESHOLDS);
  const idx   = tiers.indexOf(tier);
  if (idx === -1 || idx === tiers.length - 1) return 100; // Champion = full bar
  const ceil = TIER_THRESHOLDS[tiers[idx + 1]];
  return Math.min(100, Math.max(0, Math.round((lp - floor) / (ceil - floor) * 100)));
}

/** Is this player still in placement (< 5 ranked games)? */
const isPlacing = computed(() => memberStats.placement_games < 5);

// Member stats (loaded from pb_profiles when logged in)
const memberStats = reactive({
  wins: 0, losses: 0, draws: 0,
  ranked_lp: 0, ranked_tier: "unranked",
  ranked_wins: 0, ranked_losses: 0, ranked_peak_lp: 0,
  placement_games: 0, win_streak: 0, demotion_shield: 0,
  standard_tier: null, mirror_war_tier: null, blind_draft_tier: null,
  uid: null,
});
watch(loggedIn, async (isIn) => {
  if (!isIn) {
    Object.assign(memberStats, {
      wins: 0, losses: 0, draws: 0,
      ranked_lp: 0, ranked_tier: "unranked",
      ranked_wins: 0, ranked_losses: 0, ranked_peak_lp: 0,
      placement_games: 0, win_streak: 0, demotion_shield: 0,
      standard_tier: null, mirror_war_tier: null, blind_draft_tier: null,
      uid: null,
    });
    return;
  }
  try {
    const { supabase } = await import("./lib/supabase.js");
    const { getUser } = await import("./lib/auth.js");
    const user = await getUser();
    if (!user || !supabase) return;
    const { data } = await supabase
      .from("pb_profiles")
      .select("wins,losses,draws,ranked_lp,ranked_tier,ranked_wins,ranked_losses,ranked_peak_lp,placement_games,win_streak,demotion_shield,uid")
      .eq("id", user.id)
      .single();
    if (data) {
      memberStats.wins            = data.wins             ?? 0;
      memberStats.losses          = data.losses           ?? 0;
      memberStats.draws           = data.draws            ?? 0;
      memberStats.ranked_lp       = data.ranked_lp        ?? 0;
      memberStats.ranked_tier     = data.ranked_tier      ?? "unranked";
      memberStats.ranked_wins     = data.ranked_wins      ?? 0;
      memberStats.ranked_losses   = data.ranked_losses    ?? 0;
      memberStats.ranked_peak_lp  = data.ranked_peak_lp  ?? 0;
      memberStats.placement_games = data.placement_games  ?? 0;
      memberStats.win_streak      = data.win_streak       ?? 0;
      memberStats.demotion_shield = data.demotion_shield  ?? 0;
      // Per-mode tiers (columns may not exist yet — null means unranked)
      memberStats.standard_tier    = data.standard_tier    ?? null;
      memberStats.mirror_war_tier  = data.mirror_war_tier  ?? null;
      memberStats.blind_draft_tier = data.blind_draft_tier ?? null;
      memberStats.uid              = data.uid              ?? null;
    }
  } catch {}
}, { immediate: true });

const isInGame = computed(() => screen.value === "couch" || screen.value === "ai" || screen.value === "online" || screen.value === "puzzle");

/* ============================================================
   MATCH HISTORY
============================================================ */
const mhPageSize = 10;

const mh = reactive({
  items:      [],
  loading:    false,
  page:       0,
  filter:     "all",   // "all" | "wins" | "losses"
  expandedId: null,
  total:      0,
});

const mhFilters = [
  { key: "all",    label: "ALL" },
  { key: "casual", label: "CASUAL" },
  { key: "ranked", label: "RANKED" },
];

const mhPageCount = computed(() => Math.ceil(mh.total / mhPageSize));

async function loadMatchHistory() {
  if (!loggedIn.value) return;
  mh.loading = true;
  mh.items   = [];
  try {
    const { supabase }  = await import("./lib/supabase.js");
    const { getUser }   = await import("./lib/auth.js");
    const user = await getUser();
    if (!user || !supabase) return;

    const userId = user.id;
    const from   = mh.page * mhPageSize;
    const to     = from + mhPageSize - 1;

    let query = supabase
      .from("pb_matches")
      .select(
        "id, lobby_id, round_number, player1_id, player2_id, winner_id, loser_id, end_reason, duration_sec, mode, created_at",
        { count: "exact" }
      )
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (mh.filter === "casual") query = query.in("mode", ["online","quick","custom"]);
    if (mh.filter === "ranked") query = query.eq("mode", "ranked");

    const { data: matches, count, error } = await query;
    if (error) throw error;

    mh.total = count || 0;

    // Batch-resolve opponent usernames
    const opponentIds = [
      ...new Set(
        (matches || [])
          .map(m => m.player1_id === userId ? m.player2_id : m.player1_id)
          .filter(Boolean)
      ),
    ];

    let profileMap = {};
    if (opponentIds.length > 0) {
      const { data: profiles } = await supabase
        .from("pb_profiles")
        .select("id, username, display_name")
        .in("id", opponentIds);
      for (const p of profiles || []) profileMap[p.id] = p;
    }

    mh.items = (matches || []).map(m => {
      const oppId = m.player1_id === userId ? m.player2_id : m.player1_id;
      const opp   = profileMap[oppId];
      return {
        ...m,
        result:       m.winner_id === userId ? "W" : m.loser_id === userId ? "L" : "D",
        opponentName: opp?.display_name || opp?.username || "Unknown",
        opponentId:   oppId,
      };
    });
  } catch (e) {
    console.warn("[matchHistory] load failed:", e?.message ?? e);
  } finally {
    mh.loading = false;
  }
}

function mhSetFilter(f) {
  if (mh.filter === f) return;
  mh.filter     = f;
  mh.page       = 0;
  mh.expandedId = null;
  loadMatchHistory();
}

function mhChangePage(pg) {
  if (pg < 0 || pg >= mhPageCount.value) return;
  mh.page       = pg;
  mh.expandedId = null;
  loadMatchHistory();
}

function mhToggleExpand(id) {
  mh.expandedId = mh.expandedId === id ? null : id;
}

function mhFormatDuration(sec) {
  if (!sec && sec !== 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mhFormatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)   return "just now";
    if (diffMin < 60)  return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)    return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7)     return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return "—"; }
}

function mhEndReasonLabel(reason) {
  switch (reason) {
    case "normal":    return "Normal";
    case "timeout":   return "Timeout";
    case "surrender": return "Surrender";
    case "dodged":    return "Dodge";
    case "abandoned": return "Abandoned";
    default:          return reason || "Normal";
  }
}

// Load when navigating to match-history OR profile
watch(
  () => screen.value,
  (s) => {
    if (s === "match-history" || s === "profile") {
      mh.page       = 0;
      mh.filter     = "all";
      mh.expandedId = null;
      loadMatchHistory();
    }
    if (s === "profile") {
      profileTab.value = 'overview';
      // Only reset viewing state if we didn't just call viewFriendProfile()
      if (!viewingFriendId.value) {
        viewingFriendData.value = null;
      }
    }
  }
);

// Page transition key (unused now but kept for reference)
const pageTransitionKey = computed(() => screen.value);

// Curtain transition
const pageBlackActive = ref(false);
const curtainColorTop = ref('#50c9ee');
const curtainColorBot = ref('#ee4b72');
let _navLocked = false;

function getCurtainColors(targetScreen) {
  if (targetScreen === 'lobby')      return ['#664BD7', '#7E5FFD'];
  if (targetScreen === 'settings')   return ['#777777', '#4E4E4E'];
  if (targetScreen === 'multiplayer')return ['#05F2A0', '#02AC71'];
  if (targetScreen === 'credits')    return ['#E5E5E5', '#CFCCCC'];
  if (targetScreen === 'solo')       return ['#9B5FE3', '#6D40A3'];
  if (targetScreen === 'auth')       return ['#50c9ee', '#ee4b72'];
  return ['#50c9ee', '#ee4b72']; // default / mode
}

function navTo(newScreen) {
  if (_navLocked) return;
  _navLocked = true;
  const [top, bot] = getCurtainColors(newScreen);
  curtainColorTop.value = top;
  curtainColorBot.value = bot;
  pageBlackActive.value = true;
  setTimeout(() => {
    screen.value = newScreen;
    if (newScreen === 'lobby') refreshLobby();
    setTimeout(() => {
      pageBlackActive.value = false;
      setTimeout(() => { _navLocked = false; }, 400);
    }, 40);
  }, 370);
}
const modeLabel = computed(() => {
  if (screen.value === "ai") {
    const labels = { easy: "Easy", normal: "Normal", hard: "Hard", master: "Master", expert: "Expert", ultimate: "Ultimate" };
    const roundStr = aiRound.value > 1 ? ` · R${aiRound.value}` : '';
    return `VS AI · ${labels[aiDifficulty.value] || "Easy"}${roundStr}`;
  }
  return screen.value === "couch"
       ? couchMode.value === "mirror_war"  ? "MIRROR WAR — Couch"
       : couchMode.value === "blind_draft" ? "BLIND DRAFT — Couch"
       : "Couch Play"
       : screen.value === "puzzle" ? "Puzzle Mode"
       : screen.value === "online"
           ? online.matchKind === "mirror_war"  ? "MIRROR WAR — Full Arsenal"
           : online.matchKind === "blind_draft" ? "BLIND DRAFT — Random Loadout"
           : "Online Match"
       : "—";
});

const phaseTitle = computed(() => {
  if (game.phase === "draft") return "Drafting";
  if (game.phase === "place") return "Battle";
  if (game.phase === "gameover") return "Game Over";
  return game.phase || "—";
});

// Returns "NAME'S" or "NAME's" depending on the last character of the name.
// Uppercase letter or digit → 'S  |  lowercase letter → 's  |  anything else → 's
function possessive(name) {
  if (!name) return "'S";
  const last = name[name.length - 1];
  return /[A-Z0-9]/.test(last) ? `${name}'S` : `${name}'s`;
}

// Convenient computed for the current story AI character name
const storyAiName = computed(() => {
  if (storyMode.active) return STORY_CHAPTERS[storyMode.chapterIndex]?.name ?? 'AI';
  return 'AI';
});

// Theme color for the current story AI character
const storyAiColor = computed(() => {
  if (storyMode.active) return STORY_CHAPTERS[storyMode.chapterIndex]?.color ?? '#ffffff';
  return '#ffffff';
});

const phaseSub = computed(() => {
  if (screen.value === "puzzle") return "";
  if (game.phase === "draft") {
    if (screen.value === "ai") {
      if (game.draftTurn === humanPlayer.value) {
        return `${possessive(displayName.value ?? 'YOUR')} Pick`;
      } else {
        return `${possessive(storyAiName.value)} Pick`;
      }
    }
    return `Pick: P${game.draftTurn}`;
  }
  if (game.phase === "place") {
    if (screen.value === "ai") {
      if (game.currentPlayer === humanPlayer.value) {
        return `${possessive(displayName.value ?? 'YOUR')} Turn`;
      } else {
        return `${possessive(storyAiName.value)} Turn`;
      }
    }
    return `Turn: P${game.currentPlayer}`;
  }
  return "";
});

const canGoBack = computed(() =>
  ["mode", "multiplayer", "solo", "story", "lobby", "ranked",
   "leaderboards", "shop", "profile", "match-history", "puzzle", "settings", "credits"].includes(screen.value)
);


// Menu-style chrome (menus only)
const isMenuScreen = computed(() => !isInGame.value);

// Stop menu BGM as soon as a match starts.
watch(isInGame, (v) => {
  if (v) {
    stopMenuBgm();
    // best-effort start game bgm (may require user gesture)
    tryPlayGameBgm();
  } else {
    stopCouchBgm();
    stopOnlineBgm();
    // If the user has already interacted once, we can resume menu BGM.
    tryPlayMenuBgm();
  }
});

// Keep volumes in sync (also persists to localStorage)
watch([bgmVolumeUi, sfxVolumeUi], () => {
  saveAudioPrefs();
  try {
    if (_menuBgm) _menuBgm.volume = bgmVolume.value;
    if (_couchBgm) _couchBgm.volume = bgmVolume.value;
    if (_onlineBgm) _onlineBgm.volume = bgmVolume.value;
  } catch {}

  // If volume is 0, keep BGM playing silently (do not stop/reset).
});
const topPageTitle = computed(() => {
  if (screen.value === "auth")          return "HOME";
  if (screen.value === "mode")          return "HOME";
  if (screen.value === "multiplayer")   return "MULTIPLAYER";
  if (screen.value === "solo")          return "SOLO";
  
  if (screen.value === "lobby")         return "LOBBY";
  if (screen.value === "ranked")        return "RANKED";
  if (screen.value === "leaderboards")  return "LEADERBOARDS";
  if (screen.value === "shop")          return "SHOP";
  if (screen.value === "profile")       return "PROFILE";
  if (screen.value === "puzzle")        return "PUZZLE";
  if (screen.value === "settings")      return "SETTINGS";
  if (screen.value === "credits")       return "CREDITS";
  return "HOME";
});
const showMenuChrome = computed(() => isMenuScreen.value && ["auth","mode","multiplayer","solo","story","channel","lobby","ranked","leaderboards","shop","profile","settings","credits"].includes(screen.value));
const showBottomBar = computed(() => showMenuChrome.value && screen.value !== 'auth');

// TETR.IO-style contextual status line at the bottom
const bottomStatusText = computed(() => {
  if (screen.value === "auth")         return loggedIn.value ? `WELCOME BACK, ${displayName.value}!` : "WELCOME TO PENTOBATTLE!";
  if (screen.value === "mode")         return loggedIn.value ? `PLAYING AS ${displayName.value} · PICK A MODE` : "GUEST MODE · LOGIN TO UNLOCK RANKED & MORE";
  if (screen.value === "multiplayer")  return "PICK AN ONLINE GAME MODE";
  if (screen.value === "solo")         return "PLAY OFFLINE · VS AI OR COUCH";
  
  if (screen.value === "lobby")        return "BROWSE ROOMS · CREATE OR JOIN A SESSION";
  if (screen.value === "ranked")       return "RANKED MATCHMAKING";
  if (screen.value === "leaderboards") return "GLOBAL RANKINGS";
  if (screen.value === "settings")     return "TWEAK YOUR PENTOBATTLE EXPERIENCE";
  if (screen.value === "credits")      return "THANK YOU FOR PLAYING PENTOBATTLE!";
  if (screen.value === "shop")         return "SHOP · COMING SOON";
  if (screen.value === "profile")      return loggedIn.value ? `VIEWING PROFILE: ${displayName.value}` : "LOGIN OR CREATE AN ACCOUNT";
  if (screen.value === "puzzle")       return "PUZZLE MODE · FILL THE BOARD";
  return "";
});

// ✅ Online match
const isOnline = computed(() => screen.value === "online");
const myPlayer = ref(null); // 1 | 2 | null
const onlineSyncing = ref(false);

const onlineTurnText = computed(() => {
  if (!isOnline.value || !myPlayer.value) return "";
  if (game.phase === "gameover") return "";
  if (game.phase === "draft") return game.draftTurn === myPlayer.value ? "Your turn" : `Waiting for P${game.draftTurn}...`;
  if (game.phase === "place") return game.currentPlayer === myPlayer.value ? "Your turn" : `Waiting for P${game.currentPlayer}...`;
  return "";
});

const pingText = computed(() => {
  const v = online.pingMs;
  if (v === null || v === undefined) return "—";
  const ms = Math.max(0, Math.round(v));
  return `${ms}ms`;
});

const nowTick = ref(Date.now());

/* =========================
   ✅ UI LOADING / INPUT LOCK
   (Blocks clicks until the screen is visually ready)
========================= */
const uiLock = reactive({
  active: true,
  label: "Booting…",
  hint: "Preparing the neon arena…",
  progress: 0,
  _timer: null,
  _minUntil: 0,
});

function startUiLock({ label = "Loading…", hint = "Please wait…", minMs = 650 } = {}) {
  uiLock.active = true;
  uiLock.label = label;
  uiLock.hint = hint;
  uiLock._minUntil = Date.now() + Math.max(0, minMs);

  if (uiLock._timer) clearInterval(uiLock._timer);
  uiLock.progress = Math.min(uiLock.progress || 0, 0.15);
  uiLock._timer = setInterval(() => {
    uiLock.progress = Math.min(0.92, uiLock.progress + (0.92 - uiLock.progress) * 0.08 + 0.01);
  }, 90);
}

function stopUiLock() {
  const done = () => {
    uiLock.progress = 1;
    uiLock.active = false;
    if (uiLock._timer) clearInterval(uiLock._timer);
    uiLock._timer = null;
  };
  const left = uiLock._minUntil - Date.now();
  if (left > 0) setTimeout(done, left);
  else done();
}

function stopUiLockAfterPaint(extraMinMs = 650) {
  // Ensure at least two frames have rendered before allowing clicks.
  uiLock._minUntil = Math.max(uiLock._minUntil, Date.now() + Math.max(0, extraMinMs));
  requestAnimationFrame(() => requestAnimationFrame(() => stopUiLock()));
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

const timerHud = computed(() => {
  if (!isInGame.value) return null;
  if (game.phase === "gameover") return null;
  if (isOnline.value && !myPlayer.value) return null;
  // No timers for normal couch play or puzzle mode
  if (screen.value === 'puzzle') return null;
  if (screen.value === 'couch' && couchMode.value === 'normal') return null;

  // Draft timer (countdown)
  if (game.phase === "draft") {
    if (!game.turnStartedAt) return null;
    const limit = game.turnLimitDraftSec || 30;
    // Always read nowTick.value so Vue registers it as a reactive dependency.
    // serverNow() is a plain function (reads a non-reactive number) so using it
    // directly broke Vue's tracking in online mode — the computed never re-ran
    // and the draft timer appeared frozen. We apply the server offset manually
    // on top of the reactive tick so clock sync is preserved for fairness.
    const localTick = nowTick.value;
    const now = isOnline.value ? (localTick + (online.serverTimeOffset || 0)) : localTick;
    const left = Math.max(0, limit - (now - game.turnStartedAt) / 1000);
    const s = Math.ceil(left);
    return { kind: "draft", seconds: s, value: `${s}s` };
  }

  // Battle clock (place phase): the template reads game.battleClockSec directly
  // (mutated every 250ms by tickBattleClock) so this branch is not used by the
  // template, but we keep it for any future consumers of timerHud.
  if (game.phase === "place") {
    const localTick = nowTick.value; // keep reactive dep consistent
    const now = isOnline.value ? (localTick + (online.serverTimeOffset || 0)) : localTick;
    const p = game.currentPlayer === 2 ? 2 : 1;
    // Anchor-based: remaining = snapshot at turn-start minus elapsed this turn.
    const snapshot = game.battleClockSec?.[p] ?? 0;
    const elapsed = game.battleClockLastTickAt ? Math.max(0, (now - game.battleClockLastTickAt) / 1000) : 0;
    const v = fmtClock(Math.max(0, snapshot - elapsed));
    return { kind: "clock", player: p, value: v };
  }

  return null;
});

// Top-right button
const primaryMatchActionLabel = computed(() => {
  if (!isInGame.value) return "";
  if (screen.value === "puzzle") return game.phase === "gameover" ? "Try Again" : "Finish Puzzle";
  if (isOnline.value) return game.phase === "gameover" ? "Play Again" : "Surrender";
  return "Reset Match";
});

// Fix 19 — show a one-time hint explaining P2's adjacency constraint on their first move
const showAdjacencyHint = computed(() =>
  game.phase === 'place' &&
  game.placedCount > 0 &&
  (game.remaining[2]?.length ?? 0) === (game.picks[2]?.length ?? 0) &&
  (
    // Couch/AI: show when it's P2's turn and they haven't placed yet
    (!isOnline.value && game.currentPlayer === 2) ||
    // Online: show when it's my turn and I'm P2 with nothing placed
    (isOnline.value && myPlayer.value === 2 && game.currentPlayer === 2)
  )
);

const canAct = computed(() => {
  // Puzzle mode: player 1 always acts (no opponent)
  if (screen.value === 'puzzle') {
    if (game.phase === 'gameover') return false;
    return game.currentPlayer === 1;
  }
  // AI mode: human can only act on their own turns
  if (screen.value === 'ai') {
    if (game.phase === 'gameover') return false;
    if (game.phase === 'draft') return game.draftTurn === humanPlayer.value;
    if (game.phase === 'place') return game.currentPlayer === humanPlayer.value;
    return false;
  }
  if (!isOnline.value) return true;
  if (!myPlayer.value) return false;
  if (game.phase === "gameover") return false;
  if (game.phase === "draft") return game.draftTurn === myPlayer.value;
  if (game.phase === "place") return game.currentPlayer === myPlayer.value;
  return false;
});

// ✅ Lock input briefly when entering heavy screens (prevents early clicks before UI is painted)
watch(
  () => screen.value,
  (nv, ov) => {
    if (nv === ov) return;
    if (["online", "couch", "ai", "puzzle"].includes(nv)) {
      startUiLock({ label: "Loading match…", hint: "Syncing visuals and state…", minMs: 850 });
      stopUiLockAfterPaint(850);
    }
    if (["auth", "mode", "multiplayer", "solo", "lobby", "ranked",
             "leaderboards", "shop", "profile", "settings", "credits"].includes(nv)) {
      // If we navigated back to menus, ensure the lock isn't stuck.
      if (uiLock.active && Date.now() > uiLock._minUntil) stopUiLock();
    }
  }
);

/* =========================
   ✅ MODAL SYSTEM
========================= */
const modal = reactive({
  open: false,
  title: "Notice",
  message: "",
  tone: "info", // "info" | "bad" | "good" | "victory"
  actions: [],
  locked: false,
  diffTier: null, // null | 0-4 — AI difficulty tier for styled badge
});

const modalLines = computed(() => String(modal.message || "").split("\n").filter(Boolean));
const modalDotClass = computed(() =>
  modal.tone === "bad" ? "bad" : modal.tone === "victory" ? "victory" : modal.tone === "good" ? "good" : "info"
);

const modalCardClass = computed(() => ({
  modalVictory: modal.tone === "victory",
  modalDanger: modal.tone === "bad",
  modalResult: isResultModal.value,
}));

// Hide the X when it would do the exact same thing as the only action button.
const showModalX = computed(() => false);

// ✅ Result-style modal (Victory/Defeat) helpers + confetti
const isResultModal = computed(() => {
  const t = String(modal.title || "").toUpperCase().trim();
  if (t === "VICTORY" || t === "DEFEAT") return true;
  if (t === "MATCH ENDED") return true;
  if (/^PLAYER\s*[12]\s+WINS$/.test(t)) return true;
  return false;
});

const showConfetti = computed(() => modal.open && String(modal.title || '').toUpperCase().trim() === 'VICTORY');
const confettiPieces = ref([]);

function genConfetti(n = 70) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.25;
    const dur = 0.9 + Math.random() * 0.8;
    const rot = Math.floor(Math.random() * 360);
    const drift = (Math.random() * 2 - 1) * 26;
    const size = 6 + Math.random() * 8;
    out.push({ id: i + '-' + Date.now(), left, delay, dur, rot, drift, size });
  }
  confettiPieces.value = out;
}

watch(showConfetti, (v) => {
  if (v) {
    genConfetti(78);
    // refresh once for longer animations
    window.setTimeout(() => { if (showConfetti.value) genConfetti(60); }, 520);
  } else {
    confettiPieces.value = [];
  }
});

const resultBigTitle = computed(() => {
  if (!isResultModal.value) return String(modal.title || "");
  return String(modal.title || "").toUpperCase().trim();
});

const resultSubTitle = computed(() => {
  if (!isResultModal.value) return "";
  const t = String(modal.title || "").toUpperCase().trim();
  if (t === "VICTORY") return "YOU WIN";
  if (t === "DEFEAT") return "YOU LOSE";
  return "";
});

const resultHeroClass = computed(() => {
  const t = String(modal.title || "").toUpperCase().trim();
  return {
    victory: t === "VICTORY",
    defeat: t === "DEFEAT",
    couchP1: t === "PLAYER 1 WINS",
    couchP2: t === "PLAYER 2 WINS",
  };
});


// ✅ Ping indicator helpers
const pingLevelClass = computed(() => {
  const ms = Number(online.pingMs ?? NaN);
  if (!Number.isFinite(ms)) return 'na';
  if (ms <= 120) return 'good';
  if (ms <= 300) return 'mid';
  return 'bad';
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    showModal({ title: 'Copied', tone: 'good', message: 'Copied to clipboard.', autoDismissMs: 1800 });
  } catch {
    // fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = String(text || '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showModal({ title: 'Copied', tone: 'good', message: 'Copied to clipboard.', autoDismissMs: 1800 });
    } catch {
      showModal({ title: 'Copy Failed', tone: 'bad', message: 'Could not copy. Please copy manually.', autoDismissMs: 2500 });
    }
  }
}

function copyLobbyCode() {
  if (!online.code) return;
  copyToClipboard(online.code);
}

// Fix 17 — auto-dismiss support for non-critical toasts (e.g. "Copied!")
let _autoDismissTimer = null;

function showModal({ title = "Notice", message = "", tone = "info", actions = null, locked = false, diffTier = null, autoDismissMs = null } = {}) {
  modal.title = title;
  modal.message = message;
  modal.tone = tone;
  modal.diffTier = diffTier;
  // If actions is explicitly provided as an array (even empty), respect it.
  // If actions is null/undefined, default to a single OK button.
  if (Array.isArray(actions)) modal.actions = actions;
  else modal.actions = [{ label: "OK", tone: "primary" }];
  modal.locked = !!locked;
  modal.open = true;

  if (_autoDismissTimer) { clearTimeout(_autoDismissTimer); _autoDismissTimer = null; }
  if (autoDismissMs && !locked) {
    _autoDismissTimer = setTimeout(() => { if (modal.open) closeModal(); }, autoDismissMs);
  }
}

function closeModal() {
  if (_autoDismissTimer) { clearTimeout(_autoDismissTimer); _autoDismissTimer = null; }
  modal.open = false;
  modal.actions = [];
  modal.locked = false;
}


function onModalAction(a) {
  try {
    if (a && typeof a.onClick === "function") return a.onClick();
  } finally {
    if (modal.open) closeModal();
  }
}

/* =========================
   ✅ Hijack alert() -> Modal
========================= */
let originalAlert = null;
let tickTimer = null;
let escHandler = null;
let _bgmVisibilityHandler = null;
let _bgmPointerHandler = null;

// Layout changes handled by normal responsive CSS.

/* =========================
   QUICK MATCH — Supabase REST
========================= */
const online = reactive({
  lobbyId: null,
  code: null,
  role: null, // "host" | "guest"
  polling: false,
  pollTimer: null,
  lastAppliedVersion: 0,
  lastSeenUpdatedAt: null,
  applyingRemote: false,
  pingMs: null,
  localDirty: false,
  lastHostId: null,
  lastGuestId: null,
  waitingForOpponent: true,
  hostWaitStartedAt: null,
  lastHbSentAt: 0,
  matchKind: null, // "quickmatch" | "mirror_war" | "blind_draft" | null

  // Clock sync: offset between local Date.now() and server epoch (ms).
  // server_time = Date.now() + serverTimeOffset
  // Measured once at connect via round-trip ping.
  serverTimeOffset: 0,

  // Supabase Realtime (near-instant sync)
  rtEnabled: false,
  rtChannel: null,

  // ✅ FIX (Bug 4): Prevents concurrent ensureOnlineInitialized calls from each poll
  // cycle calling game.resetGame() and reshuffling the draft board repeatedly.
  initializingGame: false,
});

const publicLobbies = ref([]);
const loadingPublic = ref(false);
const myPrivateLobbies = ref([]);
const loadingPrivate = ref(false);

// ✅ Delegate to auth.js — works for both logged-in users and guests.
// getGuestId / getGuestName kept as thin async wrappers for call-site compat.
async function getGuestId() {
  const { getCurrentPlayerId } = await import("./lib/auth.js");
  return getCurrentPlayerId();
}

async function getGuestName() {
  const { getCurrentPlayerName } = await import("./lib/auth.js");
  return getCurrentPlayerName();
}

// Seed guestName for the topbar (best-effort; will update when auth resolves)
getGuestName().then(n => { guestName.value = n; }).catch(() => {});


function sbConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return { url, anon };
}

// ✅ Auth-aware headers: sends the user's JWT when logged in so RLS can
// identify them. Falls back to the anon key for unauthenticated requests.
async function sbHeaders() {
  const { anon } = sbConfig();
  // Try to get the live session token from the Supabase auth module
  let token = anon;
  try {
    const { getAccessToken } = await import("./lib/auth.js");
    const jwt = await getAccessToken();
    if (jwt) token = jwt;
  } catch { /* auth module not available – use anon key */ }
  return {
    apikey: anon,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function sbRestUrl(pathAndQuery) {
  const { url } = sbConfig();
  const base = String(url || "").replace(/\/+$/, "");
  return `${base}/rest/v1/${pathAndQuery}`;
}

async function ensureSupabaseReadyOrExplain() {
  const { url, anon } = sbConfig();
  if (!url || !anon) {
    showModal({
      title: "Supabase Not Connected",
      tone: "bad",
      message:
        "Missing .env values.\n\nAdd these to your project root .env:\nVITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...\n\nThen restart: npm run dev",
    });
    return false;
  }
  return true;
}

function stopPolling() {
  online.polling = false;
  onlineSyncing.value = false;
  if (online.pollTimer) clearTimeout(online.pollTimer);
  online.pollTimer = null;
  _versionMismatchWarned = false; // reset so next match can warn again
  teardownRealtimeLobby();
  // Fix 21 — re-enable local undo history when leaving online mode
  game.isLocalMode = true;
}

async function leaveOnlineLobby(reason = "left") {
  if (!online.lobbyId) return;
  if (!isOnline.value) return;

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const me = await getGuestId();
    const nextVersion = Number(lobby.version || 0) + 1;
    const st = lobby.state || {};
    const meta = st.meta || {};

    const isPublicQuick = lobby.is_private === false;
    const matchEndedLocally = game.phase === "gameover";

    if (online.role === "host") {
      const nextState = {
        ...st,
        meta: {
          ...meta,
          terminateReason: "host_left",
          terminated_at: new Date().toISOString(),
          terminated_by: me,
          reason,
        },
      };

      // ✅ Prefer DELETE so we don't leave dead lobbies behind.
      // If RLS blocks delete, we close+invalidate so nobody can join.
      try {
        const ok = await sbDeleteLobby(online.lobbyId);
        if (!ok) {
          await sbForcePatchState(online.lobbyId, {
            status: "closed",
            state: nextState,
            version: nextVersion,
            updated_at: new Date().toISOString(),
          });
        }
      } catch {
        await sbForcePatchState(online.lobbyId, {
          status: "closed",
          state: nextState,
          version: nextVersion,
          updated_at: new Date().toISOString(),
        });
      }
    } else {
      const nextState = {
        ...st,
        meta: {
          ...meta,
          notice: "guest_left",
          notice_at: new Date().toISOString(),
          notice_by: me,
          reason,
        },
      };

      await sbForcePatchState(online.lobbyId, {
        guest_id: null,
        guest_ready: false,
        status: "waiting",
        state: nextState,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      });

      // ✅ Quick Match rooms should NEVER linger.
// If someone leaves (even mid-match), delete/close the room so the next queue can't get shoved
// into an already-ended or half-finished session.
      const isQuickMatchRoom =
        String(lobby.lobby_name || "") === "__QM__" ||
        String(lobby.lobby_name || "") === "__MW__" ||
        String(lobby.lobby_name || "") === "__BD__" ||
        ["quickmatch","mirror_war","blind_draft"].includes(String(st?.meta?.kind || ""));

      if (isQuickMatchRoom) {
        try {
          const ok = await sbDeleteLobby(online.lobbyId);
          if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: matchEndedLocally ? "ended" : "abandoned", reason: "qm_leave" });
        } catch {
          // ignore
        }
      } else {
        // For normal public lobbies: if the match already ended, clear the row to avoid history pileup.
        if (isPublicQuick && matchEndedLocally) {
          try {
            const ok = await sbDeleteLobby(online.lobbyId);
            if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "ended", reason: "quick_cleanup" });
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // best-effort
  }
}

async function sbSelectLobbyById(id) {
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(id)}&select=*`), {
    headers: await sbHeaders(),
  });
  if (!res.ok) throw new Error(`Select lobby failed (${res.status})`);
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbSelectLobbyByCode(code) {
  const safe = String(code || "").trim();
  const res = await fetch(sbRestUrl(`pb_lobbies?code=eq.${encodeURIComponent(safe)}&select=*`), {
    headers: await sbHeaders(),
  });
  if (!res.ok) throw new Error(`Lookup by code failed (${res.status})`);
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbListPublicWaitingLobbies() {
  const q = [
    // include host/guest so we can show 1/2 or 2/2 and clean up 0/2 rows
    "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state",
    "status=eq.waiting",
    "is_private=eq.false",
    "mode=eq.custom",
    "guest_id=is.null",
    "order=updated_at.desc",
    "limit=25",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: await sbHeaders() });
  if (!res.ok) throw new Error(`List public lobbies failed (${res.status})`);
  return await res.json();
}

async function sbFindPublicLobbyByName(term) {
  const t = String(term || "").trim();
  if (!t) return null;
  const pat = `*${t}*`;
  const q = [
    "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
    "status=eq.waiting",
    "is_private=eq.false",
    "mode=eq.custom",
         "guest_id=is.null",
    `lobby_name=ilike.${encodeURIComponent(pat)}`,
    "order=updated_at.desc",
    "limit=10",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: await sbHeaders() });
  if (!res.ok) throw new Error(`Search lobby failed (${res.status})`);
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];
  // Return the first valid joinable lobby.
  return (
    list.find((l) => {
      if (!l) return false;
      if (isLobbyExpired(l)) return false;
      if (lobbyPlayerCount(l) <= 0) return false;
      const name = String(l?.lobby_name || "");
      if (name === "__QM__") return false;
      const meta = l?.state?.meta || {};
      if (meta?.kind === "quickmatch") return false;
      return true;
    }) || null
  );
}

async function sbCreateLobby({ isPrivate = false, lobbyName = "", extraStateMeta = null, mode = null } = {}) {
  // Fix 3 — delegate to the canonical implementation in onlineMatch.js which:
  //   • uses the Supabase SDK (not raw fetch)
  //   • generates a proper 6-char alphanumeric code (not PB-XXXXXXXX hex)
  //   • retries up to 5× on code collision
  const { createLobby: _createLobby } = await import("./lib/onlineMatch.js");
  return _createLobby({
    lobbyName,
    region: "auto",
    isPrivate,
    mode: mode || (extraStateMeta?.kind === "quickmatch" ? "quick" : "custom"),
    extraStateMeta,
  });
}

async function sbJoinLobby(lobbyId) {
  const guestId = await getGuestId();

  // Guard join so you can't join closed/full/expired lobbies.
  // This PATCH will only succeed if the lobby is still waiting and has no guest.
  //
  // FIX (Bug 2 - root cause): Clear ALL stale session data when a new guest joins.
  //
  // The core problem: a QM host lobby may carry meta.players / game state from a
  // PREVIOUS session (previous game ended without full cleanup). When a new guest
  // joins and meta.players is already set, ensureOnlineInitialized returns early
  // ("if (hasPlayers) return"), so the game is never re-initialized. Both players
  // end up applying the OLD state (gameover, old board) and get stuck.
  //
  // The fix: wipe ALL session-specific state on join (players, round, roundSeed,
  // started_at, qmAccept, etc.) and keep ONLY permanent lobby config.
  // After this, hasPlayers=false, so ensureOnlineInitialized runs a fresh init.
  let clearStateBody;
  try {
    const existing = await sbSelectLobbyById(lobbyId);
    const m = existing?.state?.meta || {};
    // Only preserve permanent lobby config, drop all previous-session data
    const cleanMeta = {};
    if (m.kind         !== undefined) cleanMeta.kind         = m.kind;
    if (m.timerMinutes !== undefined) cleanMeta.timerMinutes = m.timerMinutes;
    if (m.hidden       !== undefined) cleanMeta.hidden       = m.hidden;
    // Note: heartbeat is intentionally NOT preserved - it gets a fresh write on first poll
    // Note: players, round, roundSeed, started_at, qmAccept are all cleared
    clearStateBody = { state: { meta: cleanMeta, game: {} } };
  } catch {
    clearStateBody = { state: { meta: {}, game: {} } };
  }

  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&guest_id=is.null&status=eq.waiting`), {
    method: "PATCH",
    headers: { ...(await sbHeaders()), Prefer: "return=representation" },
    body: JSON.stringify({
      guest_id: guestId,
      // Keep status as 'waiting' until the match is fully initialized (players assigned).
      status: "waiting",
      updated_at: new Date().toISOString(),
      ...clearStateBody,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Join lobby failed (${res.status})\n${txt}`);
  }

  const rows = await res.json();
  return rows?.[0] || null;
}

/* =========================
   ✅ Lobby hygiene helpers
========================= */
const LOBBY_WAITING_TTL_MS = 5 * 60 * 1000; // 5 minutes (prevents joining very old / abandoned rooms)

function lobbyPlayerCount(lobby) {
  return (lobby?.host_id ? 1 : 0) + (lobby?.guest_id ? 1 : 0);
}

function lobbyCountLabel(lobby) {
  return `${lobbyPlayerCount(lobby)}/2`;
}

function parseIsoMs(iso) {
  const t = Date.parse(String(iso || ""));
  return Number.isFinite(t) ? t : 0;
}



function normalizeLobbyState(state) {
  // Supabase can return null for jsonb; normalize to a safe shape.
  let st = state;
  if (!st || typeof st !== "object") st = {};
  // Avoid mutating shared references from reactive payloads.
  try {
    st = structuredClone(st);
  } catch {
    try { st = JSON.parse(JSON.stringify(st)); } catch {}
  }
  if (!st || typeof st !== "object") st = {};
  if (!st.meta || typeof st.meta !== "object") st.meta = {};
  if (!st.game || typeof st.game !== "object") st.game = {};
  return st;
}
function isLobbyExpired(lobby) {
  if (!lobby) return true;
  if (String(lobby.status || "").toLowerCase() === "closed") return true;

  const pc = lobbyPlayerCount(lobby);
  if (pc === 0) return true;

  const st = lobby?.state || {};
  const meta = st?.meta || {};
  if (meta?.terminateReason === "expired") return true;

  // If it's waiting with no guest and hasn't been touched in a while, treat as abandoned.
  const upd = parseIsoMs(lobby.updated_at);
  if (String(lobby.status || "").toLowerCase() === "waiting" && !lobby.guest_id) {
    // If host heartbeat is stale (tab closed / app crashed), expire the room sooner.
    try {
      const hb = lobby?.state?.meta?.heartbeat || {};
      const hostTs = Number(hb?.host || 0);
      if (hostTs && Date.now() - hostTs > 90_000) return true;
    } catch {}
    if (upd && Date.now() - upd > LOBBY_WAITING_TTL_MS) return true;
  }
  return false;
}

async function cleanupLobbyIfNeeded(lobby, { reason = "cleanup" } = {}) {
  if (!lobby?.id) return;

  const pc = lobbyPlayerCount(lobby);
  if (pc === 0) {
    try {
      const ok = await sbDeleteLobby(lobby.id);
      if (!ok) await sbCloseAndNukeLobby(lobby.id, { terminateReason: "empty", reason });
    } catch {}
    return;
  }

  if (isLobbyExpired(lobby)) {
    try {
      const ok = await sbDeleteLobby(lobby.id);
      if (!ok) await sbCloseAndNukeLobby(lobby.id, { terminateReason: "expired", reason });
    } catch {}
  }
}


async function sbDeleteLobby(id) {
  // best-effort delete. If RLS blocks DELETE, fallback to closing.
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: await sbHeaders(),
  });
  if (res.ok) return true;
  return false;
}

async function sbCloseAndNukeLobby(id, metaPatch = {}) {
  // Fallback when DELETE is not allowed.
  const nowIso = new Date().toISOString();
  const lobby = await sbSelectLobbyById(id);
  const st = lobby?.state || {};
  const meta = st.meta || {};
  const nextState = { ...st, meta: { ...meta, ...metaPatch, closed_at: nowIso } };
  const nextVersion = Number(lobby?.version || 0) + 1;
  await sbForcePatchState(id, { status: "closed", state: nextState, version: nextVersion, updated_at: nowIso });
}

/**
 * Record a completed online match in pb_matches.
 * Safe to call from BOTH clients simultaneously — the server-side
 * record_match_result() RPC uses ON CONFLICT DO NOTHING, so only the
 * first call inserts; the second is silently ignored.
 * The DB trigger then auto-updates wins/losses in pb_profiles.
 * Note: draws are impossible in Pentomino Battle — winner_id is null only
 * for dodged/abandoned matches where no real game was played.
 */
async function sbRecordMatchResult({
  lobbyId,
  roundNumber = 1,
  player1Id,
  player2Id,
  winnerId   = null,
  loserId    = null,
  endReason  = "normal",
  durationSec = null,
  matchMode  = "online",
}) {
  if (!lobbyId || !player1Id || !player2Id) return;
  try {
    const { requireSupabase } = await import("./lib/supabase.js");
    const sb = requireSupabase();
    await sb.rpc("record_match_result", {
      p_lobby_id:     lobbyId,
      p_round:        roundNumber,
      p_player1_id:   player1Id,
      p_player2_id:   player2Id,
      p_winner_id:    winnerId,
      p_loser_id:     loserId,
      p_end_reason:   endReason,
      p_duration_sec: durationSec,
      p_mode:         matchMode,
    });
  } catch (e) {
    // Non-fatal — stats can be backfilled later. Never break the UX.
    console.warn("[pbMatch] record_match_result failed:", e?.message ?? e);
  }
}

/* =========================
   ✅ ONLINE STATE SERIALIZATION
========================= */
function makeRandomPlayers(hostId, guestId) {
  // Random per round (written into state.meta.players so both clients agree)
  const hostIsP1 = Math.random() < 0.5;
  const p1 = hostIsP1 ? hostId : guestId;
  const p2 = hostIsP1 ? guestId : hostId;
  return { hostIsP1, players: { 1: p1, 2: p2 } };
}

function makeRoundSeed() {
  try {
    // Prefer crypto when available
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return `${a[0].toString(16)}${a[1].toString(16)}_${Date.now().toString(16)}`;
  } catch {
    return `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
}

function hashSeedToUint32(seed) {
  // Simple djb2-style hash of a string seed → uint32
  let h = 5381;
  for (let i = 0; i < (seed || "").length; i++) {
    h = (Math.imul(h, 33) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getMyPlayerFromPlayers(players, myId) {
  if (!players || !myId) return null;
  if (players["1"] === myId || players[1] === myId) return 1;
  if (players["2"] === myId || players[2] === myId) return 2;
  return null;
}

function deepClone(obj) {
  // Use structuredClone when available (much faster than JSON round-trip for plain objects/arrays)
  try {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function buildSyncedState(meta = {}) {
  // Heartbeat lives in state.meta so we can detect silent tab closes.
  const hb = { ...(meta.heartbeat || {}) };
  if (online?.role) hb[online.role] = Date.now();
  const metaWithHb = { ...meta, heartbeat: hb, clientVersion: CLIENT_VERSION };

  return {
    meta: metaWithHb,
    game: {
      phase: game.phase,
      boardW: game.boardW,
      boardH: game.boardH,
      allowFlip: game.allowFlip,

      board: deepClone(game.board),
      // Only sync draftBoard during draft phase — skip for MW/BD which never draft
      draftBoard: game.phase === 'draft' ? deepClone(game.draftBoard) : null,

      draftTurn: game.draftTurn,
      currentPlayer: game.currentPlayer,

      pool: deepClone(game.pool),
      picks: deepClone(game.picks),
      remaining: deepClone(game.remaining),
      placedCount: game.placedCount,

      // Normalize turnStartedAt to server epoch so both clients share the same reference point.
      // The receiving client's timerHud uses serverNow() to measure elapsed time against it.
      turnStartedAt: game.turnStartedAt
        ? game.turnStartedAt + (online?.serverTimeOffset || 0)
        : game.turnStartedAt,
      matchInvalid: game.matchInvalid,
      matchInvalidReason: game.matchInvalidReason,
      turnLimitDraftSec: game.turnLimitDraftSec,
      turnLimitPlaceSec: game.turnLimitPlaceSec,

      winner: game.winner,

      rematch: deepClone(game.rematch),
      rematchDeclinedBy: game.rematchDeclinedBy,

      battleClockSec: deepClone(game.battleClockSec),
      battleClockInitSec: game.battleClockInitSec || 180,
      // ✅ FIX: battleClockLastTickAt is intentionally NOT synced to the remote client.
      // The receiving client always resets it to Date.now() in applySyncedState, so
      // sending our local timestamp would only cause confusion and is wasted bandwidth.
      // battleClockSec (the remaining time) is the single source of truth.

      // Helps prevent false timeouts under latency
      timeoutPendingAt: game.timeoutPendingAt,
      timeoutPendingPlayer: game.timeoutPendingPlayer,

      // Draft grace window — sync so both clients share the same pending-dodge state.
      // If the opponent already entered the grace window, receiving client inherits it
      // rather than restarting the window from scratch on the next poll.
      draftTimeoutPendingAt: game.draftTimeoutPendingAt,

      // Needed for correct gameover messaging (surrender / timeout) across both clients.
      lastMove: deepClone(game.lastMove),

      // Monotonic sequence to prevent last-write-wins clobber.
      moveSeq: Number(game.moveSeq || 0),
      // ✅ FIX: Sync draft opener so both clients compute snake turn order identically.
      // Without this, guest always defaults _draftOpener=1 and computes the wrong CYCLE.
      _draftOpener: game._draftOpener ?? 1,
    },
  };
}

function applySyncedState(state) {
  if (!state || !state.game) return;

  // ✅ FIX: Skip applying a state with no phase — this means the game slot was just
  // cleared (e.g., by sbJoinLobby wiping game:{}) and has no real data yet.
  // Applying an empty game object would clobber local state with undefined fields.
  if (!state.game.phase) return;

  // ✅ Anti-clobber (stronger): never apply an older move sequence.
  // This prevents the visible “snap back” where an older remote snapshot briefly overwrites
  // a newer local move (even if it later corrects itself).
  try {
    const localSeq = Number(game.moveSeq || 0);
    const remoteSeq = Number(state?.game?.moveSeq || 0);
    if (remoteSeq && localSeq && remoteSeq < localSeq) return;
    // Fix 7 — detect forged / wildly out-of-range seq numbers.
    if (localSeq > 0 && remoteSeq > localSeq + 10) {
      console.warn('[online] suspicious moveSeq jump', localSeq, '->', remoteSeq, '— ignoring');
      return;
    }
  } catch {}

  online.applyingRemote = true;
  try {
    const g = state.game;

    game.$patch({
      phase: g.phase,
      boardW: g.boardW,
      boardH: g.boardH,
      allowFlip: g.allowFlip,

      board: g.board,
      // Only overwrite draftBoard if the remote actually sent one (draft phase only)
      ...(g.draftBoard !== null && g.draftBoard !== undefined ? { draftBoard: g.draftBoard } : {}),

      draftTurn: g.draftTurn,
      currentPlayer: g.currentPlayer,

      pool: g.pool,
      picks: g.picks,
      remaining: g.remaining,
      placedCount: g.placedCount,

      // Convert turnStartedAt from server epoch back to local epoch using our measured offset
      turnStartedAt: g.turnStartedAt
        ? g.turnStartedAt - (online?.serverTimeOffset || 0)
        : g.turnStartedAt,
      matchInvalid: g.matchInvalid,
      matchInvalidReason: g.matchInvalidReason,
      turnLimitDraftSec: g.turnLimitDraftSec,
      turnLimitPlaceSec: g.turnLimitPlaceSec,

      winner: g.winner,

      rematch: g.rematch,
      rematchDeclinedBy: g.rematchDeclinedBy,
      battleClockSec: g.battleClockSec,
      battleClockInitSec: g.battleClockInitSec || 180,
      // ✅ FIX (Timer Bug): Reset tick reference to local NOW — never use the remote timestamp.
      // The remote battleClockLastTickAt was Date.now() on the OTHER client 300-600 ms ago.
      // Applying it directly made tickBattleClock deduct that full DB round-trip from the active
      // player's clock on every move (~5-12 seconds of phantom time stolen across a full game).
      // battleClockSec already contains the correct remaining time; we just restart ticking
      // from this exact moment so no latency is ever double-counted.
      battleClockLastTickAt: Date.now(),

      // ✅ FIX: Clear local timeout-pending state on any incoming remote update.
      // If the opponent just made a valid move, their push clears these fields in the snapshot,
      // cancelling any grace-period countdown we had started locally.
      timeoutPendingAt: g.timeoutPendingAt,
      timeoutPendingPlayer: g.timeoutPendingPlayer,

      // Inherit the draft grace window from the remote snapshot.
      // If remote is null (opponent picked successfully), this cancels our local window too.
      draftTimeoutPendingAt: g.draftTimeoutPendingAt ?? null,

      lastMove: g.lastMove,

      moveSeq: Number(g.moveSeq || 0),
      _draftOpener: g._draftOpener ?? 1,
    });

    online.localDirty = false;
  } finally {
    setTimeout(() => {
      online.applyingRemote = false;
    }, 0);
  }
}

// ✅ Server-confirm a timeout before committing it (prevents false timeouts when a last-second
// opponent move arrives slightly late).
async function confirmTimeoutWithServer(localMoveSeq) {
  try {
    if (!online?.lobbyId) return true;
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby?.state?.game) return true;
    const st = normalizeLobbyState(lobby.state);
    const remoteSeq = Number(st?.game?.moveSeq || 0);
    const remoteLM = st?.game?.lastMove;

    // If server has a same-seq but different lastMove type, trust server.
    // (Prevents a local timeout from winning a race against an opponent place that landed first.)
    if (remoteSeq && localMoveSeq && remoteSeq === localMoveSeq) {
      const lt = String(game?.lastMove?.type || "");
      const rt = String(remoteLM?.type || "");
      if (lt === "timeout" && rt && rt !== "timeout") {
        applySyncedState(st);
        return false;
      }
    }

    // If server already has a newer move than our local timeout, do NOT push timeout.
    if (remoteSeq && localMoveSeq && remoteSeq > localMoveSeq) {
      applySyncedState(st);
      return false;
    }

    // If server is not actually gameover anymore (or never was), do NOT push timeout.
    if (String(st?.game?.phase || "") !== "gameover") {
      applySyncedState(st);
      return false;
    }

    return true;
  } catch {
    // If we can't confirm, fall back to pushing (better than hanging).
    return true;
  }
}

async function sbPatchStateWithVersionGuard(lobbyId, knownVersion, patchObj) {
  const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&version=eq.${encodeURIComponent(knownVersion)}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...(await sbHeaders()), Prefer: "return=representation" },
    body: JSON.stringify(patchObj),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`State update failed (${res.status})\n${txt}`);
  }

  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

async function sbForcePatchState(lobbyId, patchObj) {
  const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...(await sbHeaders()), Prefer: "return=representation" },
    body: JSON.stringify(patchObj),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Force update failed (${res.status})\n${txt}`);
  }
  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

async function pushMyState(reason = "") {
  if (!isOnline.value) return;
  if (!online.lobbyId) return;
  if (online.applyingRemote) return;

  // ✅ Only push gameplay state when you are allowed to act.
  // Allow a few non-turn actions (rematch responses / surrender).
  // IMPORTANT: after you make a move, the store immediately flips the turn to the opponent.
  // That means `canAct` becomes false *right after your move*, but we still MUST push your move
  // or the other player will never receive it.
  const nonTurnAllowed =
    reason === "surrender" || String(reason || "").startsWith("rematch_") || reason === "rematch_request";

  if (online.waitingForOpponent && !nonTurnAllowed) return;

  const me = myPlayer.value;
  const lastByMe =
    !!me &&
    !!game.lastMove &&
    Number(game.lastMove.player) === Number(me) &&
    (game.lastMove.type === "draft" ||
      game.lastMove.type === "place" ||
      game.lastMove.type === "timeout" ||
      game.lastMove.type === "surrender" ||
      game.lastMove.type === "dodged");

  // `watch` pushes are debounced from reactive changes.
  // Allow them when it's your turn OR when you just made the last move (even if turn already flipped).
  if (reason === "watch") {
    if (!canAct.value && !(online.localDirty && lastByMe)) return;
  } else {
    if (!canAct.value && !nonTurnAllowed) return;
  }

  onlineSyncing.value = true;
  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const meta = lobby.state?.meta ? lobby.state.meta : {};
    const snapshot = buildSyncedState(meta);
    const nextVersion = Number(lobby.version || 0) + 1;

    let updated = await sbPatchStateWithVersionGuard(online.lobbyId, lobby.version, {
      state: snapshot,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      const fresh = await sbSelectLobbyById(online.lobbyId);
      if (!fresh) return;

      updated = await sbPatchStateWithVersionGuard(online.lobbyId, fresh.version, {
        state: snapshot,
        version: Number(fresh.version || 0) + 1,
        updated_at: new Date().toISOString(),
      });

      // IMPORTANT:
      // Never force-overwrite gameplay state.
      // Force-patching can clobber a newer opponent move (race), causing “move not saved / board resets”.
      // If we still can't patch after refetching, keep localDirty=true so the next debounced push retries.
    }

    if (updated?.version) {
      online.lastAppliedVersion = Math.max(online.lastAppliedVersion || 0, updated.version);
      online.lastSeenUpdatedAt = updated.updated_at || null;
      online.localDirty = false;

      // ── Broadcast the state over the realtime channel immediately ──
      // The opponent receives this in ~30-80ms instead of waiting for postgres_changes (~200-500ms).
      // The DB write above is still the source of truth; broadcast is just a fast delivery layer.
      if (online.rtChannel && online.rtEnabled) {
        try {
          online.rtChannel.send({
            type: "broadcast",
            event: "move",
            payload: { version: updated.version, state: snapshot },
          });
        } catch {
          // non-fatal — postgres_changes is the fallback
        }
      }
    }
  } catch {
    // quiet
  } finally {
    onlineSyncing.value = false;
  }
}

async function maybeSetMyPlayerFromLobby(lobby) {
  const myId = await getGuestId();
  const players = lobby?.state?.meta?.players;

  if (players) {
    myPlayer.value = getMyPlayerFromPlayers(players, myId);
    return;
  }

}

async function ensureOnlineInitialized(lobby) {
  if (!lobby) return;

  const hasPlayers = !!lobby?.state?.meta?.players;

  // ✅ FIX (Bug 2): The stale-session problem is handled UPSTREAM in sbJoinLobby,
  // which now clears meta.players before a new guest joins. So hasPlayers=true here
  // means the game is GENUINELY initialized for the current session. Do not re-init.
  if (hasPlayers) return;

  if (!lobby.host_id || !lobby.guest_id) return;

  // ✅ FIX (Bug 4): Prevent concurrent init calls from re-running game.resetGame()
  // every 850ms poll cycle. Without this flag, each poll loop iteration calls
  // ensureOnlineInitialized, which calls game.resetGame() generating a new random
  // draftBoard — causing the draft board to reshuffle constantly while waiting.
  if (online.initializingGame) return;
  online.initializingGame = true;

  // ✅ FIX: Only the HOST writes the initial game state.
  // If the guest also tried to init, we had a race where:
  //   1. Both call resetGame() generating DIFFERENT random draftBoards
  //   2. Both try a version-guarded write — guest loses and gets null back
  //   3. Guest does: lastAppliedVersion = null?.version || nextVersion  → sets a phantom version
  //   4. All future DB versions are lower than phantom → guest rejects every sync forever
  // Solution: guest simply waits for host's state to arrive via polling.
  if (online.role !== "host") { online.initializingGame = false; return; }

  // ✅ FIX: Re-fetch from DB before writing. The lobby passed in might be stale
  // (e.g., a heartbeat write already overwrote state, or another poll beat us here).
  // Avoid a redundant re-init if players were already written by a previous poll.
  let freshLobby;
  try {
    freshLobby = await sbSelectLobbyById(lobby.id);
  } catch {
    freshLobby = lobby;
  }
  if (freshLobby?.state?.meta?.players) return; // already initialized — nothing to do

  // Use the freshest version to avoid write conflicts
  const lobbyToInit = freshLobby || lobby;

  // ── prevMeta MUST be declared before any usage below ──────────────
  const prevMeta = lobbyToInit.state?.meta ? lobbyToInit.state.meta : {};
  const nextRound = Number(prevMeta.round || 0) + 1;

  // Randomize player numbers for THIS round, then write it once into meta.
  const { players } = makeRandomPlayers(lobbyToInit.host_id, lobbyToInit.guest_id);

  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  // ── Detect new no-draft modes and skip straight to placement ────────
  const lobbyKind = String(prevMeta?.kind || "");

  // Apply lobby timer (set by host when creating the room: 3, 5, or 7 minutes)
  const defaultMinutes = lobbyKind === "mirror_war" ? 8 : 3;
  const timerMins = Number(prevMeta?.timerMinutes || defaultMinutes);
  const timerSecs = Math.max(60, Math.min(1800, timerMins * 60));
  game.battleClockInitSec = timerSecs;
  game.battleClockSec = { 1: timerSecs, 2: timerSecs };
  const roundSeed = makeRoundSeed();

  if (lobbyKind === "mirror_war") {
    // 15×8 board, both players get all 12 pieces
    game.startPlacementDirect(ALL_PIECE_KEYS, ALL_PIECE_KEYS, 15, 8);
  } else if (lobbyKind === "blind_draft") {
    // 10×6 board, pieces split randomly by seed
    const { picks1, picks2 } = randomSplitPieces(ALL_PIECE_KEYS, hashSeedToUint32(roundSeed));
    game.startPlacementDirect(picks1, picks2, 10, 6);
  }

  const initState = buildSyncedState({
    ...prevMeta,
    players,
    round: nextRound,
    roundSeed,
    started_at: new Date().toISOString(),
  });

  const nextVersion = Number(lobbyToInit.version || 0) + 1;

  try {
    // Host is the sole author — use force-patch so transient version drift never blocks init.
    const updated = await sbForcePatchState(lobbyToInit.id, {
      state: initState,
      version: nextVersion,
      status: "playing",
      updated_at: new Date().toISOString(),
    });

    // ✅ FIX: Only update lastAppliedVersion when the write actually succeeded.
    // Previously: `updated?.version || nextVersion` set a phantom version when updated=null,
    // causing the guest to permanently reject all future syncs.
    if (updated?.version) {
      online.lastAppliedVersion = updated.version;
    }
  } catch {
    // If it failed, the guest will still apply state when the next poll reads DB.
  } finally {
    // ✅ FIX (Bug 4): Release the init lock so a future rematch can re-init.
    online.initializingGame = false;
  }
}

function teardownRealtimeLobby() {
  try {
    if (online.rtChannel && sbRealtime) {
      try { sbRealtime.removeChannel(online.rtChannel); } catch {}
    }
  } catch {}
  online.rtChannel = null;
  online.rtEnabled = false;
}

async function setupRealtimeLobby(lobbyId) {
  teardownRealtimeLobby();
  try {
    if (!sbRealtime || !lobbyId) return false;

    const channel = sbRealtime
      .channel(`pb_lobby_${lobbyId}`)
      // ── Broadcast: near-instant move delivery (bypasses DB write latency) ──
      // Host and guest push move state via broadcast on every authoritative action.
      // Latency: ~30-80ms vs ~200-500ms for postgres_changes.
      .on("broadcast", { event: "move" }, (payload) => {
        try {
          const d = payload?.payload;
          if (!d?.state || !d?.version) return;
          const v = Number(d.version);
          if (v && v <= Number(online.lastAppliedVersion || 0)) return;
          online.lastAppliedVersion = v;
          if (d.state?.game) applySyncedState(d.state);
        } catch {
          // ignore
        }
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pb_lobbies", filter: `id=eq.${lobbyId}` },
        async (payload) => {
          try {
            const row = payload?.new;
            if (!row) return;

            // Keep code/status in sync
            if (row.code) online.code = row.code;

            // Apply only newer versions
            const v = Number(row.version || 0);
            if (v && v <= Number(online.lastAppliedVersion || 0)) return;
            online.lastAppliedVersion = v;
            online.lastSeenUpdatedAt = row.updated_at || online.lastSeenUpdatedAt;

            await maybeSetMyPlayerFromLobby(row);

            const st = normalizeLobbyState(row.state);
            if (st?.game) applySyncedState(st);
          } catch {
            // ignore
          }
        }
      )
      .subscribe((status) => {
        online.rtEnabled = status === "SUBSCRIBED";
      });

    online.rtChannel = channel;
    return true;
  } catch {
    teardownRealtimeLobby();
    return false;
  }
}

/**
 * Measure server time offset via a lightweight round-trip to Supabase.
 * server_time ≈ Date.now() + online.serverTimeOffset
 * Uses the updated_at timestamp from the lobby row as a server time reference.
 * This lets the timer use corrected timestamps so both clients share the same clock,
 * eliminating timer drift caused by DB latency in turnStartedAt.
 */
async function measureServerTimeOffset() {
  if (!online.lobbyId) return;
  try {
    const t0 = Date.now();
    const lobby = await sbSelectLobbyById(online.lobbyId);
    const t1 = Date.now();
    if (!lobby?.updated_at) return;
    const rtt = t1 - t0;
    const serverTs = new Date(lobby.updated_at).getTime();
    if (!serverTs) return;
    // Estimate server time at round-trip midpoint
    online.serverTimeOffset = serverTs - (t0 + rtt / 2);
  } catch {
    online.serverTimeOffset = 0;
  }
}

/** Returns current time corrected by measured server offset */
function serverNow() {
  return Date.now() + (online.serverTimeOffset || 0);
}

async function startPollingLobby(lobbyId, role, modeHint = null) {
  // ✅ Prevent early clicks while the online screen + first poll are not fully rendered.
  startUiLock({ label: "Connecting…", hint: "Establishing link to lobby…", minMs: 900 });

  stopPolling();
  online.polling = true;
  online.lobbyId = lobbyId;
  online.role = role;
  online.lastAppliedVersion = 0;
  online.lastSeenUpdatedAt = null;

  // Fix 21 — disable undo history in online games to avoid memory leaks and
  // prevent any possibility of undoing an opponent's move.
  game.isLocalMode = false;
  game.history = [];


  // ✅ Reset per-lobby trackers (prevents false 'opponent left' on fresh lobbies)
  online.lastHostId = null;
  online.lastGuestId = null;
  online.waitingForOpponent = true;
  online.code = null;
  online.pingMs = null;
  online.localDirty = false;
  online.hostWaitStartedAt = role === "host" ? Date.now() : null;
  online.initializingGame = false; // ✅ FIX (Bug 4): reset init lock for new session
  online.matchKind = null;
  if (modeHint) online.matchKind = modeHint;
  myPlayer.value = null;

  // Near-instant sync via Supabase Realtime (polling remains as fallback + presence/TTL logic)
  // Also measure server clock offset for timer sync
  measureServerTimeOffset();
  setupRealtimeLobby(lobbyId);

  screen.value = "online";
  if (modeHint === "mirror_war") {
    game.boardW = 15;
    game.boardH = 8;
  } else {
    game.boardW = 10;
    game.boardH = 6;
  }
  game.allowFlip = allowFlip.value;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.resetGame();

  // User gesture initiated -> safe to try starting match BGM.
  tryPlayGameBgm();

  let firstPollDone = false;

  const pollLoop = async () => {
    try {
      onlineSyncing.value = true;

      const t0 = performance.now();
      const lobby = await sbSelectLobbyById(lobbyId);
      online.pingMs = performance.now() - t0;

      if (!lobby) {
        stopPolling();
        myPlayer.value = null;
        screen.value = "multiplayer";
        showModal({ title: "Lobby Closed", message: "The lobby no longer exists.\nReturning to main menu.", tone: "bad" });
        return;
      }

      online.code = lobby.code || online.code;

      // Track match kind reactively for UI labels
      if (lobby?.state?.meta?.kind) online.matchKind = lobby.state.meta.kind;

      // ✅ Lightweight presence heartbeat (even while waiting) so stale rooms can be cleaned up.
      // Throttled to avoid spamming the DB.
      // ✅ FIX: Skip heartbeat entirely during the initialization window —
      // when BOTH players are present but `players` assignment hasn't been written yet.
      // The heartbeat uses the stale pre-init lobby.state (no `players`), and
      // sbForcePatchState can OVERWRITE the host's init write, wiping the players field.
      // This caused a loop: host inits → heartbeat erases players → host inits again → ...
      // and the guest eventually sees a gameover from a stale/empty state.
      const inInitWindow = !!(lobby.host_id && lobby.guest_id && !lobby?.state?.meta?.players);
      if (!inInitWindow && online.role && (online.waitingForOpponent || game.phase === "gameover")) {
        const now = Date.now();
        if (!online.lastHbSentAt || now - online.lastHbSentAt > 15_000) {
          online.lastHbSentAt = now;
          try {
            const st = normalizeLobbyState(lobby.state);
            const meta = st?.meta || {};
            const hb = { ...(meta.heartbeat || {}) };
            hb[online.role] = now;
            st.meta = { ...meta, heartbeat: hb };
            const nextVersion = Number(lobby?.version || 0) + 1;
            await sbForcePatchState(lobbyId, {
              state: st,
              version: nextVersion,
              updated_at: new Date().toISOString(),
            });
          } catch {
            // ignore
          }
        }
      }

      // ✅ If someone joined an expired/abandoned room, cancel cleanly.
      if (isLobbyExpired(lobby)) {
        stopPolling();
        myPlayer.value = null;
        screen.value = "multiplayer";
        showModal({
          title: "Expired Lobby",
          tone: "bad",
          message: online.role === "guest"
            ? "You joined an expired lobby.\nPlease create or join a fresh lobby."
            : "This lobby expired.\nPlease create a fresh lobby.",
          actions: [{ label: "OK", tone: "primary" }],
        });
        return;
      }

      // Keep / show the waiting modal (host only) — but don't interrupt other modals.
      // ✅ FIX: Only show while truly waiting for a guest to JOIN (guest_id is null).
      // Removed the old condition that checked `waitingForOpponent` alone, which could
      // re-trigger this modal during the init window when the guest is already present.
      if (online.role === "host" && online.waitingForOpponent && online.code && !lobby.guest_id) {
        if (!modal.open) {
          showWaitingForOpponentModal(online.code);
        } else if (modal.title === "Waiting for Opponent") {
          modal.message = `Waiting for opponent…\nCode: ${online.code || "—"}`;
        }
      }

      const prevGuest = online.lastGuestId;
      online.lastGuestId = lobby.guest_id || null;
      online.lastHostId = lobby.host_id || null;

      const terminateReason = lobby?.state?.meta?.terminateReason || null;
      if (lobby.status === "closed" || terminateReason === "host_left") {
        stopPolling();
        myPlayer.value = null;
        screen.value = "multiplayer";
        showModal({
          title: "Match Terminated",
          tone: "bad",
          message: "Lobby creator left — terminating the game.\nReturning to main menu.",
        });
        return;
      }

      // ── Version mismatch guard ──────────────────────────────────────────────
      // If the opponent was initialised on a different client build, warn once.
      // We don't hard-terminate because minor version bumps are usually safe;
      // the operator can decide to force a reload if needed.
      if (!_versionMismatchWarned) {
        const remoteVersion = lobby?.state?.meta?.clientVersion;
        if (remoteVersion && remoteVersion !== CLIENT_VERSION) {
          _versionMismatchWarned = true;
          console.warn(
            `[version] mismatch — local: ${CLIENT_VERSION}, remote: ${remoteVersion}`
          );
          showModal({
            title: "Version Mismatch",
            tone: "bad",
            message:
              `Your client (v${CLIENT_VERSION}) differs from your opponent's (v${remoteVersion}).\n` +
              "This may cause sync issues. Refresh the page to get the latest version.",
            actions: [
              {
                label: "Refresh Now",
                tone: "primary",
                onClick: () => { window.location.reload(); },
              },
              { label: "Continue Anyway", tone: "soft" },
            ],
          });
        }
      }

	      // ✅ Presence heartbeat: handle silent tab closes.
	      // IMPORTANT: only use heartbeat-based disconnect detection while WAITING or on GAME OVER.
	      // During active gameplay there can be long stretches with no state pushes (thinking / lag),
	      // and we must NOT auto-terminate a live match just because a heartbeat isn't updated.
      try {
        const hb = lobby?.state?.meta?.heartbeat || {};
        const oppRole = online.role === "host" ? "guest" : "host";
        const oppTs = Number(hb?.[oppRole] || 0);
        const staleMs = oppTs ? Date.now() - oppTs : 0;
        const bothPresent = !!(lobby.host_id && lobby.guest_id);

	        const checkPresence = !!(online.waitingForOpponent || game.phase === "gameover");
	        const staleHard = checkPresence && bothPresent && staleMs > 45_000;
	        const staleOnGameOver = checkPresence && bothPresent && game.phase === "gameover" && staleMs > 25_000;

        if ((staleHard || staleOnGameOver) && oppRole === "host") {
          // Guest detected that the HOST vanished — terminate and leave.
          try {
            await sbCloseAndNukeLobby(lobbyId, { terminateReason: "host_timeout", reason: "heartbeat" });
          } catch {
            // ignore
          }
          stopPolling();
          myPlayer.value = null;
          screen.value = "multiplayer";
          showModal({
            title: "Match Terminated",
            tone: "bad",
            message: "Lobby creator disconnected — terminating the game.\nReturning to main menu.",
          });
          return;
        }

        if ((staleHard || staleOnGameOver) && oppRole === "guest" && online.role === "host") {
          // Host detected that the GUEST vanished on game-over / waiting screen.
          // During active play we intentionally skip this (heartbeats are paused mid-game).
          try {
            await sbCloseAndNukeLobby(lobbyId, { terminateReason: "guest_timeout", reason: "heartbeat" });
          } catch {
            // ignore
          }
          stopPolling();
          myPlayer.value = null;
          screen.value = "multiplayer";
          showModal({
            title: "Opponent Disconnected",
            tone: "bad",
            message: "Your opponent disappeared and did not return.\nReturning to main menu.",
          });
          return;
        }
      } catch {
        // ignore
      }

      if (online.role === "host" && !prevGuest && lobby.guest_id) {
        if (modal.open && String(modal.title || "").toLowerCase().includes("lobby ready")) closeModal();
        if (modal.open && modal.title === "Waiting for Opponent") closeModal();
        showModal({
          title: "Player Joined!",
          tone: "good",
          message: `A challenger joined your lobby.\nCode: ${lobby.code || "—"}`,
        });
      }

      // ✅ Host waiting timer: 60s to get a challenger.
      if (online.role === "host" && !lobby.guest_id && lobby.host_id) {
        if (!online.hostWaitStartedAt) online.hostWaitStartedAt = Date.now();
        const waitedMs = Date.now() - online.hostWaitStartedAt;
        if (waitedMs >= 60_000) {
          // Expire room creation.
          try {
            if (online.lobbyId) {
              const ok = await sbDeleteLobby(online.lobbyId);
              if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "expired" });
            }
          } catch {
            // ignore
          } finally {
            stopPolling();
            myPlayer.value = null;
            screen.value = "multiplayer";
            closeModal();
            showModal({ title: "Room Creation Expired", tone: "bad", message: "No one joined within 60 seconds." });
          }
          return;
        }
      }

      if (online.role === "host" && prevGuest && !lobby.guest_id && lobby.host_id) {
        myPlayer.value = null;
        game.turnStartedAt = null;
        game.battleClockLastTickAt = null;
        online.waitingForOpponent = true;
        online.hostWaitStartedAt = Date.now();

        // ✅ Reset round assignment so the next challenger gets a fresh random P1/P2.
        (async () => {
          try {
            const meta = lobby.state?.meta ? lobby.state.meta : {};
            game.boardW = 10;
            game.boardH = 6;
            game.allowFlip = allowFlip.value;
            game.resetGame();
            const snapshot = buildSyncedState({ ...meta, players: null, started_at: null, roundSeed: null });
            const nextVersion = Number(lobby.version || 0) + 1;
            await sbForcePatchState(lobby.id, {
              state: snapshot,
              version: nextVersion,
              status: "waiting",
              updated_at: new Date().toISOString(),
            });
          } catch {
            // ignore
          }
        })();
        showModal({
          title: "Opponent Left",
          tone: "bad",
          message: "Your opponent left.\nThis lobby will stay open and wait for a new challenger.",
          actions: [
            {
              label: "OK",
              tone: "primary",
              onClick: () => {
                showWaitingForOpponentModal(lobby.code || online.code);
              },
            },
          ],
        });
      }

      // ✅ FIX: Never oscillate waitingForOpponent once the game is initialized.
      // Previously: every poll re-evaluated this from DB state, so a heartbeat-overwritten
      // state (temporarily missing `players`) would flip back to true mid-game, causing
      // the host to re-show "Waiting for Opponent" and re-run ensureOnlineInitialized.
      // Now: only update when there's a clear signal (guest left, or players confirmed).
      if (!lobby.guest_id) {
        // Guest left — genuinely waiting again
        online.waitingForOpponent = true;
      } else if (lobby?.state?.meta?.players) {
        // Both players present AND game properly initialized
        online.waitingForOpponent = false;
      }
      // else: both present but players not yet written — keep current value (don't re-trigger init loop)

      // If the match is ready, ensure the waiting modal is gone.
      if (!online.waitingForOpponent && modal.open && modal.title === "Waiting for Opponent") {
        closeModal();
      }

      if (lobby.host_id && lobby.guest_id) {
        await ensureOnlineInitialized(lobby);
      }

      // ✅ FIX: After host initializes state, re-fetch so this poll applies the NEW version.
      // Without this, the current `lobby` object is stale (pre-init) and the guest misses
      // the first state update, leaving them with an empty/wrong board for a full poll cycle.
      let effectiveLobby = lobby;
      if (online.role === "guest" && lobby.host_id && lobby.guest_id && !lobby?.state?.meta?.players) {
        try {
          const refetched = await sbSelectLobbyById(lobbyId);
          if (refetched?.state?.meta?.players) {
            effectiveLobby = refetched;
            online.waitingForOpponent = false;
            if (modal.open && modal.title === "Waiting for Opponent") closeModal();
          }
        } catch { /* ignore — next poll will catch it */ }
      }

      await maybeSetMyPlayerFromLobby(effectiveLobby);

      const v = Number(effectiveLobby.version || 0);
      const st = effectiveLobby.state || null;

      if (st && v && v > (online.lastAppliedVersion || 0)) {
        online.lastAppliedVersion = v;
        online.lastSeenUpdatedAt = effectiveLobby.updated_at || null;
        applySyncedState(st);
      }

      if (!firstPollDone) {
        firstPollDone = true;
        // Allow interaction after the first successful paint + poll.
        uiLock.label = "Loaded";
        uiLock.hint = "Entering match…";
        stopUiLockAfterPaint(700);
      }
    } catch {
      // keep polling quietly
    } finally {
      onlineSyncing.value = false;
    }

    // Adaptive polling:
    // Realtime channel is the PRIMARY delivery path (~30-80ms latency).
    // Polling is the RECOVERY path — fires when RT drops or a message is missed.
    // ✅ FIX: Tighter intervals for faster recovery without hammering the DB.
    //   • With active RT:    800ms in-game, 1500ms while waiting / gameover
    //   • Without RT:       180ms in-game (aggressive fallback), 500ms otherwise
    const fast  = !online.waitingForOpponent && (game.phase === "draft" || game.phase === "place");
    const rtReady = !!(online.rtEnabled && online.rtChannel);
    const ms = rtReady ? (fast ? 800 : 1500) : (fast ? 180 : 500);
    if (online.polling) online.pollTimer = setTimeout(pollLoop, ms);
  };

  // Kick immediately.
  online.pollTimer = setTimeout(pollLoop, 0);
}

/* =========================
   Auto-push on authoritative changes
========================= */
let pushDebounceTimer = null;

watch(
  () => [
    isOnline.value,
    game.phase,
    game.draftTurn,
    game.currentPlayer,
    game.winner,
    game.placedCount,
    game.matchInvalid,
    game.matchInvalidReason,
    game.moveSeq,        // captures every authoritative state change (draft pick, place, timeout, surrender)
    game.rematchDeclinedBy,
    game.rematch?.[1],
    game.rematch?.[2],
  ],
  () => {
    if (!isOnline.value) return;
    if (!online.lobbyId) return;
    if (online.applyingRemote) return;

    online.localDirty = true;

    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    // Slightly tighter debounce improves perceived latency without spamming.
    pushDebounceTimer = setTimeout(() => pushMyState("watch"), 35);
  }
);

/* =========================
   ✅ IN-GAME SFX WATCHERS
   All in-game sound effect triggers live here.
   Separated from game logic so they are easy to adjust.
========================= */

// ── Phase transitions ──────────────────────────────────────────────────────
// Modes WITH a draft phase  (normal / online):
//   game.phase goes "draft" → "place"
//   → draft_start.wav fires when drafting begins
//   → battle_start.wav fires when battle begins (draft complete)
//
// Modes WITHOUT a draft phase (blind_draft / mirror_war / puzzle):
//   game.phase starts directly at "place"
//   → battle_start.wav fires immediately as the match start sound
let _lastSfxPhase = null;
watch(
  () => game.phase,
  (p) => {
    if (!isInGame.value) return;
    if (p === _lastSfxPhase) return;
    _lastSfxPhase = p;
    if (p === "draft") { sfxDraftStart(); }
    if (p === "place") { sfxBattleStart(); _resetClockWarnings(); }
    if (p === "gameover") {
      const w = game.winner;
      const me = myPlayer.value;
      setTimeout(() => {
        if (screen.value === "online" && me) {
          if (w === me) sfxVictory(); else sfxDefeat();
        } else if (screen.value === "ai") {
          if (w === humanPlayer?.value) sfxVictory(); else sfxDefeat();
          // Always fire a game-over taunt in AI mode
          const trigger = w === aiPlayer?.value ? 'game_over_win' : 'game_over_lose';
          _alwaysTaunt(trigger, 200);
        } else {
          if (w) sfxVictory();
        }
      }, 3000);
    }
  }
);

// ── Pick (draft phase) ─────────────────────────────────────────────────────
let _lastPickTotal = 0;
watch(
  () => (game.picks?.[1]?.length ?? 0) + (game.picks?.[2]?.length ?? 0),
  (n) => {
    if (!isInGame.value || game.phase !== "draft") return;
    if (n > _lastPickTotal) sfxPlayUrl(sfxPickUrl);
    _lastPickTotal = n;
  }
);
watch(isInGame, (v) => { if (!v) _lastPickTotal = 0; });

// ── Draft turn change ──────────────────────────────────────────────────────
watch(
  () => game.draftTurn,
  (v, prev) => {
    if (!isInGame.value || game.phase !== "draft") return;
    if (v !== prev) sfxDraftTurn();
  }
);

// ── Place (battle phase) ───────────────────────────────────────────────────
let _lastPlacedCount = 0;
watch(
  () => game.placedCount,
  (n) => {
    if (!isInGame.value || game.phase !== "place") return;
    if (n > _lastPlacedCount) sfxPlayUrl(sfxPlaceUrl);
    _lastPlacedCount = n;
  }
);
watch(isInGame, (v) => { if (!v) _lastPlacedCount = 0; });

// ── Turn change (battle phase) ─────────────────────────────────────────────
watch(
  () => game.currentPlayer,
  (v, prev) => {
    if (!isInGame.value || game.phase !== "place") return;
    if (v !== prev) { sfxTurnChime(); _resetClockWarnings(); }
  }
);

// ── Rotate / Flip ──────────────────────────────────────────────────────────
watch(() => game.rotation, (v, prev) => {
  if (!isInGame.value) return;
  if (v !== prev) sfxRotate();
});
watch(() => game.flipped, (v, prev) => {
  if (!isInGame.value) return;
  if (v !== prev) sfxFlip();
});

// ── Battle clock urgency (fires once per turn at ≤30s and ≤10s) ───────────
watch(
  () => {
    if (game.phase !== "place") return null;
    return game.battleClockSec?.[game.currentPlayer] ?? null;
  },
  (sec) => {
    if (sec === null || !isInGame.value) return;
    if (!_sfxClockWarned[10] && sec <= 10) {
      _sfxClockWarned[10] = true;
      _sfxClockWarned[30] = true;
      sfxTimerWarning();
    } else if (!_sfxClockWarned[30] && sec <= 30) {
      _sfxClockWarned[30] = true;
      sfxTimerWarning();
    }
  }
);

// ── QM Accept window opens ─────────────────────────────────────────────────
watch(() => qmAccept.open, (v) => { if (v) sfxQmAlert(); });

// ── Opponent joined (host side — waitingForOpponent flips to false) ────────
watch(
  () => online.waitingForOpponent,
  (v, prev) => {
    if (!isOnline.value) return;
    if (prev === true && v === false) sfxMatchFound();
  }
);

// ── Surrender sound ────────────────────────────────────────────────────────
// Fires on both clients when a surrender lastMove is recorded
let _lastSfxMoveSeq = 0;
watch(
  () => game.moveSeq,
  () => {
    if (!isInGame.value) return;
    if ((game.moveSeq ?? 0) <= _lastSfxMoveSeq) return;
    _lastSfxMoveSeq = game.moveSeq ?? 0;
    if (game.lastMove?.type === "surrender") sfxSurrender();
  }
);
watch(isInGame, (v) => { if (!v) _lastSfxMoveSeq = 0; });

/* =========================
   STORY TAUNT BUBBLE
   Claude-generated in-character taunts during AI story matches.
========================= */
const storyTaunt = reactive({
  visible:  false,
  text:     '',
  charName: '',
  emoji:    '',
  color:    '#fff',
  _timer:   null,
});

function _dismissTaunt() {
  if (storyTaunt._timer) { clearTimeout(storyTaunt._timer); storyTaunt._timer = null; }
  storyTaunt.visible = false;
}

// ── Build rich game-state context from actual move data ──────────────────
function _buildGameContext(trigger) {
  const ap = aiPlayer?.value;
  const hp = humanPlayer?.value;
  const lm = game.lastMove;

  const aiRemaining  = game.remaining?.[ap]?.length ?? '?';
  const humRemaining = game.remaining?.[hp]?.length ?? '?';
  const aiPicked     = game.picks?.[ap]?.length     ?? '?';
  const humPicked    = game.picks?.[hp]?.length     ?? '?';
  const totalPlaced  = game.placedCount ?? 0;

  // Territory count
  let aiCells = 0, humCells = 0;
  try {
    for (const row of (game.board || [])) {
      for (const cell of (row || [])) {
        if (cell?.player === ap) aiCells++;
        else if (cell?.player === hp) humCells++;
      }
    }
  } catch {}
  const leadDesc = aiCells > humCells + 4
    ? `You lead on territory: ${aiCells} vs ${humCells} cells.`
    : humCells > aiCells + 4
    ? `The human leads: ${humCells} vs ${aiCells} cells.`
    : `Territory even: ${aiCells} vs ${humCells} cells.`;

  // Describe the actual last move
  let lastMoveDesc = '';
  if (lm?.type === 'place' && lm?.piece) {
    const who = lm.player === ap ? 'You (the AI)' : 'The human opponent';
    lastMoveDesc = `${who} just placed the ${lm.piece}-piece at board position (${lm.x}, ${lm.y}).`;
  } else if (lm?.type === 'draft' && lm?.piece) {
    const who = lm.player === ap ? 'You (the AI)' : 'The human opponent';
    lastMoveDesc = `${who} just drafted the ${lm.piece}-piece from the pool.`;
  }

  const phaseDesc = game.phase === 'draft'
    ? `DRAFT phase — you have picked ${aiPicked} pieces, human has picked ${humPicked}. ${game.pool?.length ?? '?'} pieces remain.`
    : `BATTLE phase — you have ${aiRemaining} pieces left, human has ${humRemaining}. ${totalPlaced} placed total. ${leadDesc}`;

  const triggerMap = {
    draft_ai_pick:    "It is now your turn to pick a piece from the draft.",
    battle_ai_turn:   "It is now your turn to place a piece.",
    battle_ai_placed: "You just placed your piece; it is now the human's turn.",
    battle_start:     "The placement battle phase has just begun.",
    last_move:        "The human has only ONE valid placement left — this may be decisive.",
    game_over_win:    "The game just ended and you won.",
    game_over_lose:   "The game just ended and you lost.",
  };

  return `${lastMoveDesc} ${phaseDesc} Situation: ${triggerMap[trigger] || trigger}`.trim();
}

async function _fetchAndShowTaunt(trigger) {
  if (!storyMode.active) return;
  const ch = STORY_CHAPTERS[storyMode.chapterIndex];
  if (!ch) return;

  _dismissTaunt();

  storyTaunt.charName = ch.name;
  storyTaunt.emoji    = ch.emoji;
  storyTaunt.color    = ch.color || '#fff';
  storyTaunt.text     = '…';
  storyTaunt.visible  = true;

  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const context = _buildGameContext(trigger);

  try {
    if (!apiKey) {
      console.warn('[PentoBattle Taunt] No VITE_GROQ_API_KEY found in .env — using fallback dialogue.');
      throw new Error('No API key');
    }
    console.log('[PentoBattle Taunt] Calling Groq for:', ch.name, '| trigger:', trigger, '| context:', context);

    const trashTalkStyle = {
      easy:    "You are clueless and accidentally condescending. Trash-talk by saying something confidently wrong or hilariously unaware.",
      cyano:   "You are a narcissist streamer. Trash-talk by making everything about yourself, your fans, and how effortless this is for you.",
      norm:    "You are a quiet intimidator. Trash-talk with calm, clinical observations that feel more threatening than shouting.",
      ohmen:   "You are a paranoid strategist. Trash-talk by claiming you already predicted their move and know their next three.",
      teift:   "You are depressed and unbothered. Trash-talk by being so dismissive it's insulting — like you can't even be bothered to care.",
      lilica:  "You are chaotically indecisive. Trash-talk by second-guessing yourself but still somehow making the opponent feel bad.",
      sefia:   "You are a cold observer. Trash-talk by citing a specific tell or habit you've noticed about the opponent.",
      vlad:    "You are a centuries-old vegetarian vampire. Trash-talk with eerie calm and occasional references to your dietary choices.",
      axia:    "You are aggressively cheerful and secretly terrifying. Trash-talk with compliments that are actually devastating.",
      mumu:    "You are the game's creator. Trash-talk by pointing out you BUILT this — you know every mechanic, every weakness.",
      grand:   "You are the eternal runner-up with a chip on your shoulder. Trash-talk by invoking your years of experience and near-wins.",
      zero:    "You are the undefeated champion. Trash-talk with quiet, absolute certainty — not aggression, just inevitability.",
    }[ch.id] || "Trash-talk in your character's voice.";

    const systemPrompt = `You are ${ch.name}, a competitive pentomino tile-placement game character. It is your turn and you are TRASH TALKING the human player.

TITLE: "${ch.title}"
TRASH-TALK STYLE: ${trashTalkStyle}

Here is exactly how this character speaks — match this voice precisely:
${(ch.preDialogue || []).map(l => '- ' + l.replace(/^\"|\"$/g, '').replace(/^"|"$/g, '')).join('\n')}

Deliver ONE sentence of in-character trash talk. Max 12 words. Reference the game situation if it fits. No quotes. No narration. Speak directly to the opponent.`;

    const resp = await fetch('/groq-api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 80,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: context },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    const text = (data?.choices?.[0]?.message?.content || '').trim().replace(/^"|"$/g, '');
    console.log('[PentoBattle Taunt] Groq response:', text || '(empty)');
    if (data?.error) console.error('[PentoBattle Taunt] Groq API error:', data.error);
    if (text) storyTaunt.text = text;
  } catch (err) {
    console.error('[PentoBattle Taunt] API failed, using fallback. Error:', err?.message || err);
    const lines = ch.preDialogue || [];
    storyTaunt.text = (lines[Math.floor(Math.random() * lines.length)] || '…').replace(/^"|"$/g, '');
  }

  storyTaunt._timer = setTimeout(_dismissTaunt, 5000);
}

// ── Taunt rate control ───────────────────────────────────────────────
// Always fire: battle_start, last_move, game_over_win, game_over_lose
// Draft picks: ~40% chance, min 20s cooldown between draft taunts
// Battle turns: ~30% chance per AI turn, min 25s cooldown
// After AI places: ~20% chance, only if no taunt fired in last 20s
const TAUNT_COOLDOWN_DRAFT  = 20_000;
const TAUNT_COOLDOWN_BATTLE = 25_000;
let _lastTauntAt = 0;

function _maybeTagunt(trigger, chance) {
  const now = Date.now();
  const cooldown = trigger.startsWith('draft') ? TAUNT_COOLDOWN_DRAFT : TAUNT_COOLDOWN_BATTLE;
  if (now - _lastTauntAt < cooldown) return;
  if (Math.random() > chance) return;
  _lastTauntAt = now;
  _fetchAndShowTaunt(trigger);
}

// Always-fire wrapper (resets cooldown too so nothing fires right after)
function _alwaysTaunt(trigger, delayMs = 0) {
  _lastTauntAt = Date.now();
  setTimeout(() => _fetchAndShowTaunt(trigger), delayMs);
}

// draft_ai_pick and battle_ai_turn taunts are now fired directly
// inside _doAiMove so the piece waits for the taunt to finish.

// Taunt only fires from _doAiMove during AI's turn
let _tauntLastPlaced = 0;
watch(isInGame, (v) => { if (!v) { _tauntLastPlaced = 0; _lastTauntAt = 0; _dismissTaunt(); _lastMoveFired = false; } });

// battle_start taunt is handled by _doAiMove when AI takes first turn

// Called from the one-valid-move watcher when the human is down to 1 placement
function _tauntLastMove() {
  if (!storyMode.active || game.currentPlayer !== humanPlayer?.value) return;
  _alwaysTaunt('last_move');
}

// ── Only one valid placement left ─────────────────────────────────────────
// Counts total placeable positions across ALL remaining pieces of the current
// player in all rotations (and flips if allowed). If exactly one legal position
// exists across all of them, plays last_move.wav so the player knows they're
// forced into a single spot.
//
// Uses early-exit: stops counting as soon as a second placement is found, so
// the loop is cheap in practice (board is usually still mostly empty when this
// triggers late in the game).
function _countValidPlacements() {
  try {
    const cp = game.currentPlayer;
    if (!cp || game.phase !== "place") return 0;
    const pieces  = game.remaining?.[cp];
    if (!pieces?.length) return 0;
    const board   = game.board;
    const W       = game.boardW;
    const H       = game.boardH;
    if (!board || !W || !H) return 0;
    const doFlip  = game.allowFlip;

    // Build the set of unique transforms to try per piece.
    // Rotations 0-3 × flip true/false (if allowed).
    const transforms = [];
    for (let rot = 0; rot < 4; rot++) {
      transforms.push({ rot, flip: false });
      if (doFlip) transforms.push({ rot, flip: true });
    }

    // Normalise cells to top-left = (0,0) after each transform.
    function normalisedCells(baseCells, rot, flip) {
      const t = transformCells(baseCells, rot, flip);
      const minR = Math.min(...t.map(([r]) => r));
      const minC = Math.min(...t.map(([, c]) => c));
      return t.map(([r, c]) => [r - minR, c - minC]);
    }

    // Deduplicate transformed shapes: no point checking the same orientation twice.
    function shapeKey(cells) {
      return cells.map(([r, c]) => `${r},${c}`).sort().join("|");
    }

    let count = 0;

    outer:
    for (const pk of pieces) {
      const base = PENTOMINOES[pk];
      if (!base) continue;

      // Collect unique orientations for this piece.
      const seen = new Set();
      const orientations = [];
      for (const { rot, flip } of transforms) {
        const cells = normalisedCells(base, rot, flip);
        const key   = shapeKey(cells);
        if (seen.has(key)) continue;
        seen.add(key);
        orientations.push(cells);
      }

      for (const cells of orientations) {
        const maxAy = H - (Math.max(...cells.map(([r]) => r)) + 1);
        const maxAx = W - (Math.max(...cells.map(([, c]) => c)) + 1);

        for (let ay = 0; ay <= maxAy; ay++) {
          for (let ax = 0; ax <= maxAx; ax++) {
            // Check if piece fits at anchor (ax, ay).
            let fits = true;
            for (const [r, c] of cells) {
              const row = board[ay + r];
              if (!row || row[ax + c] !== null) { fits = false; break; }
            }
            if (fits) {
              count++;
              if (count > 1) break outer; // early exit — we only care about exactly 1
            }
          }
        }
      }
    }

    return count;
  } catch {
    return -1; // on any error, don't fire
  }
}

// Play last_move.wav when the final piece is placed (gameover triggers),
// then delay any result modal by 3 seconds.
let _lastMoveFired = false;
let _gameoverDelay = 0; // tracks the 3s delay so callers can check
watch(() => game.phase, (phase) => {
  if (phase === 'draft' || phase === 'place') { _lastMoveFired = false; _gameoverDelay = 0; }
});

/* =========================
   ONLINE RESET / ACTIONS
========================= */
async function onResetClick() {
  if (!isOnline.value || !online.lobbyId) {
    if (couchMode.value === "mirror_war") {
      startCouchMirrorWar();
    } else if (couchMode.value === "blind_draft") {
      startCouchBlindDraft();
    } else {
      game.resetGame();
    }
    return;
  }

  // Prefer a single author for round resets to avoid version fights.
  // Host resets the round; guest simply waits for the new state to arrive via polling.
  if (online.role !== "host") {
    closeModal(); // ✅ FIX: dismiss the gameover/rematch modal so guest sees the new round
    return;
  }

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    if (!lobby.host_id || !lobby.guest_id) {
      showModal({
        title: "Rematch Failed",
        tone: "bad",
        message: "Opponent is no longer in the lobby.",
        actions: [{ label: "OK", tone: "primary", onClick: () => stopAndExitToMenu("Opponent left.") }],
      });
      return;
    }

    const meta = lobby.state?.meta ? lobby.state.meta : {};
    const nextRound = Number(meta.round || 0) + 1;

    const { players } = makeRandomPlayers(lobby.host_id, lobby.guest_id);

    const newRoundSeed = makeRoundSeed();
    const lobbyKind = String(meta.kind || "");

    // ✅ FIX: Clear rematch flags before building snapshot so the new round
    // doesn't inherit {1:true,2:true} which would immediately re-trigger the
    // rematch watcher on the guest and cause a loop / stale gameover state.
    game.rematch = { 1: false, 2: false };
    game.rematchDeclinedBy = null;

    game.allowFlip = allowFlip.value;
    if (lobbyKind === "mirror_war") {
      game.startPlacementDirect(ALL_PIECE_KEYS, ALL_PIECE_KEYS, 15, 8);
    } else if (lobbyKind === "blind_draft") {
      const { picks1, picks2 } = randomSplitPieces(ALL_PIECE_KEYS, hashSeedToUint32(newRoundSeed));
      game.startPlacementDirect(picks1, picks2, 10, 6);
    } else {
      game.boardW = 10;
      game.boardH = 6;
      game.resetGame();
    }

    const snapshot = buildSyncedState({
      ...meta,
      players,
      round: nextRound,
      roundSeed: newRoundSeed,
      started_at: new Date().toISOString(),
    });
    const nextVersion = Number(lobby.version || 0) + 1;

    await sbForcePatchState(online.lobbyId, {
      state: snapshot,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });
  } catch {
    game.resetGame();
  }
}

function winnerMessage(w) {
  const me = myPlayer.value;

  // Local modes: keep it simple unless we have a specific end reason.
  if (!me) {
    const lm = game.lastMove?.type;
    if (lm === "surrender") return "Opponent surrendered.";
    if (lm === "timeout") {
      const loser = Number(game.lastMove?.player);
      if (screen.value === 'ai') {
        return loser === humanPlayer.value ? "Your timer runs out." : "Opponent timer runs out.";
      }
      return "Opponent timer runs out.";
    }
    if (!isOnline.value) return "GG!";
    return `Player ${w} wins.\nGG!`;
  }

  // Online: custom copy for surrender / timer.
  const lm = game.lastMove?.type;
  const loser = Number(game.lastMove?.player);

  if (lm === "surrender") {
    return loser === Number(me) ? "You surrendered." : "Opponent surrendered.";
  }

  if (lm === "timeout") {
    return loser === Number(me) ? "Your timer runs out." : "Opponent timer runs out.";
  }

  if (w === null || w === undefined) {
    return game.matchInvalid
      ? `Match invalid — ${game.matchInvalidReason || "dodged"}.`
      : "Match ended.";
  }

  return w === me ? "You win!\nGG!" : "Opponent wins.\nGG!";
}

function stopAndExitToMenu(note = "") {
  leaveOnlineLobby("exit").finally(() => {
    stopPolling();
    myPlayer.value = null;
    screen.value = "multiplayer";
    if (note) showModal({ title: "Returned", tone: "info", message: note });
  });
}

async function cancelWaitingLobby() {
  try {
    if (online.lobbyId) {
      const ok = await sbDeleteLobby(online.lobbyId);
      if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "cancel_wait" });
    }
  } catch {
    // ignore
  } finally {
    closeModal();
    stopPolling();
    myPlayer.value = null;
    screen.value = "multiplayer";
  }
}

function showWaitingForOpponentModal(code) {
  showModal({
    title: "Waiting for Opponent",
    tone: "info",
    message: `Waiting for opponent…\nCode: ${code || "—"}`,
    actions: online.role === "host"
      ? [{ label: "Cancel Waiting", tone: "soft", onClick: cancelWaitingLobby }]
      : [],
    locked: true,
  });
}

function requestPlayAgain() {
  if (!isOnline.value) {
    onResetClick();
    return;
  }
  if (!myPlayer.value) return;

  const me = myPlayer.value;
  const other = me === 1 ? 2 : 1;

  if (game.rematchDeclinedBy) {
    stopAndExitToMenu("Rematch declined.");
    return;
  }

  // If opponent already requested, your click acts as ACCEPT.
  if (game.rematch?.[other] && !game.rematch?.[me]) {
    game.requestRematch(me);
    online.localDirty = true;
    pushMyState("rematch_yes");
    return;
  }

  // Already requested.
  if (game.rematch?.[me]) {
    showModal({
      title: "Rematch Requested",
      tone: "info",
      message: "Waiting for the other player to answer…",
      actions: [
        { label: "OK", tone: "primary" },
        { label: "Cancel & Exit", tone: "soft", onClick: () => stopAndExitToMenu("Exited match.") },
      ],
    });
    return;
  }

  game.requestRematch(me);
  online.localDirty = true;
  pushMyState("rematch_request");

  showModal({
    title: "Rematch Requested",
    tone: "info",
    message: "Waiting for the other player to answer…",
    actions: [
      { label: "OK", tone: "primary" },
      { label: "Cancel & Exit", tone: "soft", onClick: () => stopAndExitToMenu("Exited match.") },
    ],
  });
}

function onPrimaryMatchAction() {
  if (!isInGame.value) return;

  // Puzzle mode: Finish Puzzle or Try Again
  if (screen.value === "puzzle") {
    if (game.phase === "gameover") {
      startPuzzleMode();
    } else {
      handlePuzzleEnd();
    }
    return;
  }

  const lab = String(primaryMatchActionLabel.value || "").trim().toLowerCase();

  // ✅ Reset confirm (local modes / any reset label)
  if (lab.includes("reset")) {
    confirmInGame({
      title: "Reset Game?",
      message: "Are you sure you want to reset the game?",
      yesLabel: "YES",
      noLabel: "NO",
      onYes: () => onResetClick(),
    });
    return;
  }

  if (isOnline.value) {
    if (!myPlayer.value) return;

    if (game.phase === "gameover") {
      requestPlayAgain();
      return;
    }

    // ✅ Surrender confirm (online)
    if (lab.includes("surrender") || !lab) {
      confirmInGame({
        title: "Surrender?",
        message: "Are you sure you want to surrender?",
        yesLabel: "YES",
        noLabel: "NO",
        onYes: () => {
          game.surrender(myPlayer.value);
          online.localDirty = true;
          pushMyState("surrender");
        },
      });
      return;
    }
    return;
  }

  // Local modes fallback (should already be handled by reset branch above)
  onResetClick();
}

/* =========================
   GAMEOVER + REMATCH UX
========================= */

async function ensureRematchPrompt() {
  if (!isOnline.value) return;
  if (game.phase !== "gameover") return;
  if (!myPlayer.value) return;

  const me = myPlayer.value;
  const other = me === 1 ? 2 : 1;

  if (game.rematchDeclinedBy) return;

  // If opponent requested and you haven't responded, force the Accept/Decline prompt.
  if (game.rematch?.[other] && !game.rematch?.[me]) {
    // Avoid spamming the same modal every poll.
    if (modal.open && modal.title === "Play Again?") return;

    showModal({
      title: "Play Again?",
      tone: "good",
      message: "Opponent wants a rematch.\nDo you accept?",
      actions: [
        {
          label: "ACCEPT",
          tone: "primary",
          onClick: () => {
            game.requestRematch(me);
            online.localDirty = true;
            pushMyState("rematch_yes");
          },
        },
        {
          label: "DECLINE",
          tone: "soft",
          onClick: () => {
            game.declineRematch(me);
            online.localDirty = true;
            pushMyState("rematch_no");
          },
        },
      ],
    });
  }
}

// Auto-finish puzzle when all 12 pieces are placed
watch(
  () => game.remaining?.[1]?.length,
  (len) => {
    if (screen.value !== "puzzle") return;
    if (game.phase === "gameover") return;
    if (len === 0) handlePuzzleEnd();
  }
);

watch(
  () => game.phase,
  (p, prev) => {
    if (p !== "gameover" || prev === "gameover") return;

    // Play last_move sound then wait 3s before showing any result
    sfxLastMove();
    _gameoverDelay = Date.now() + 3000;

    setTimeout(() => {
      _handleGameover();
    }, 3000);
  }
);

async function _handleGameover() {
    // _puzzleEndFired prevents double-call if remaining watcher fires first.
    if (screen.value === "puzzle") {
      if (!_puzzleEndFired) handlePuzzleEnd();
      return;
    }

    if (isOnline.value && myPlayer.value) {
      const me = myPlayer.value;
      const other = me === 1 ? 2 : 1;

      if (game.lastMove?.type === "dodged") {
        // ✅ Auto dodge ends the session for BOTH players and removes the lobby.
        const msg =
          game.matchInvalidReason ||
          `Player ${game.lastMove?.player || "?"} did not pick — automatically dodges the game.`;

        showModal({
  title: "Auto Dodge",
  tone: "bad",
  message: msg + "\n\nReturning to main menu…",
  actions: [{ label: "OK", tone: "primary" }],
});

        // terminate + cleanup in the background (best-effort)
        (async () => {
          try {
            if (online.lobbyId) {
              const ok = await sbDeleteLobby(online.lobbyId);
              if (!ok) {
                await sbCloseAndNukeLobby(online.lobbyId, {
                  terminateReason: "auto_dodge",
                  matchInvalidReason: msg,
                });
              }
            }
          } catch {
            // ignore
          } finally {
            stopPolling();
            myPlayer.value = null;
            screen.value = "mode";
          }
        })();

        return;
      }

      if (game.rematch?.[other] && !game.rematch?.[me] && !game.rematchDeclinedBy) {
        ensureRematchPrompt();
        return;
      }
    }

    const w = game.winner;
    const me = myPlayer.value;
    const iWin = me && (w === me);
    const isBad = game.lastMove?.type === "timeout" || game.lastMove?.type === "surrender";

    // ✅ Result modal copy rules:
    // - Couch/AI: show PLAYER 1 WINS / PLAYER 2 WINS
    // - Online: show VICTORY / DEFEAT per screen
    let title = "MATCH ENDED";
    let tone = "good";

    if (!isOnline.value) {
      // AI mode
      if (screen.value === 'ai') {
        const humanWon = w === humanPlayer.value;
        const aiWon = w === aiPlayer.value;

        // ✅ STORY MODE: intercept result and route to story handler
        if (storyMode.active) {
          saveAiDraftHistory(game.picks[humanPlayer.value], !!aiWon);
          handleStoryResult(humanWon);
          return;
        }

        let newStageUnlocked = false;
        if (humanWon) { aiScore.p1++; newStageUnlocked = tryUnlockNextDifficulty(humanPlayer.value, humanPlayer.value); }
        else if (aiWon) aiScore.p2++;

        // ✅ Save draft picks to history so Legendary can learn human preferences
        saveAiDraftHistory(game.picks[humanPlayer.value], !!aiWon);

        // If a new stage was just unlocked, skip the victory modal entirely.
        // The unlock animation overlay (shown after 1.2 s) acts as the result screen
        // and already provides Main Menu / Play Again / Next Battle actions.
        if (newStageUnlocked) return;

        const diffLabel = { easy:'Easy', normal:'Normal', hard:'Hard', master:'Master', expert:'Expert', ultimate:'Ultimate' }[aiDifficulty.value] || aiDifficulty.value;
        title = humanWon ? "VICTORY" : "DEFEAT";
        tone = humanWon ? "victory" : "bad";
        const nextDiff = getNextRank(aiDifficulty.value);
        const allCleared = !nextDiff;

        // Special cinematic for beating Legendary — the ultimate achievement.
        if (humanWon && allCleared) {
          setTimeout(() => { legendaryConqueredAnim.active = true; }, 1000);
          return;
        }

        let actions;
        if (humanWon) {
          actions = [
            { label: "Next Battle", tone: "primary", onClick: () => { closeModal(); _launchAi(nextDiff); } },
            { label: "Main Menu",   tone: "soft",    onClick: () => { screen.value = 'solo'; } },
          ];
        } else {
          actions = [
            { label: "Play Again", tone: "primary", onClick: () => { closeModal(); nextAiRound(); } },
            { label: "Main Menu",  tone: "soft",    onClick: () => { screen.value = 'solo'; } },
          ];
        }

        const diffTierVal = { easy:0, normal:1, hard:2, master:3, expert:4, ultimate:5 }[aiDifficulty.value] ?? null;
        showModal({
          title,
          message: `${winnerMessage(w ?? "?")} \nDifficulty: ${diffLabel}`,
          tone,
          actions,
          diffTier: diffTierVal,
        });
        return;
      }
      // Couch mode
      title = w ? `PLAYER ${w} WINS` : "MATCH ENDED";
      tone = w ? "victory" : "good";
    } else {
      title = iWin ? "VICTORY" : w ? "DEFEAT" : "MATCH ENDED";
      tone = iWin ? "victory" : isBad ? "bad" : "good";
    }
    showModal({
      title,
      message: winnerMessage(w ?? "?"),
      tone,
      actions: isOnline.value
        ? [
            { label: "Play Again",  tone: "primary", onClick: requestPlayAgain },
            { label: "Main Menu",   tone: "soft",    onClick: () => stopAndExitToMenu("") },
          ]
        : [
            { label: "Play Again", tone: "primary", onClick: onResetClick },
          ],
    });

    // ✅ Record match result to pb_matches (both clients call; server deduplicates)
    if (isOnline.value && online.lobbyId) {
      (async () => {
        try {
          const lobby  = await sbSelectLobbyById(online.lobbyId);
          if (!lobby) return;
          const meta   = lobby?.state?.meta || {};
          const players = meta?.players || {};

          // Resolve player IDs from the meta.players map: { "1": userId, "2": userId }
          const p1Id = String(players["1"] || players[1] || "");
          const p2Id = String(players["2"] || players[2] || "");
          if (!p1Id || !p2Id) return;

          const w       = game.winner;
          const winnerId = w ? (w === 1 ? p1Id : p2Id) : null;
          const loserId  = w ? (w === 1 ? p2Id : p1Id) : null;

          // Calculate wall-clock duration from match start
          const startedAt   = meta?.started_at ? Date.parse(meta.started_at) : null;
          const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

          // Map game end type to DB end_reason
          const lm = game.lastMove?.type || "normal";
          const endReason = ["timeout","surrender","dodged","abandoned"].includes(lm) ? lm : "normal";

          await sbRecordMatchResult({
            lobbyId:     online.lobbyId,
            roundNumber: Number(meta?.round || 1),
            player1Id:   p1Id,
            player2Id:   p2Id,
            winnerId,
            loserId,
            endReason,
            durationSec,
            matchMode:   meta?.kind === "mirror_war" ? "mirror_war"
                       : meta?.kind === "blind_draft" ? "blind_draft"
                       : meta?.mode === "ranked" || lobby?.mode === "ranked" ? "ranked"
                       : "online",
          });

          // ── Fetch LP delta for ranked matches and update modal message ────
          if (meta?.mode === "ranked" || lobby?.mode === "ranked") {
            try {
              const { requireSupabase } = await import("./lib/supabase.js");
              const sb = requireSupabase();
              const myId = myPlayer.value === 1 ? p1Id : p2Id;
              const { data: lpResult } = await sb.rpc("pb_get_match_lp_result", {
                p_lobby_id:  online.lobbyId,
                p_round:     Number(meta?.round || 1),
                p_player_id: myId,
              });
              if (lpResult?.found) {
                const delta    = lpResult.lp_delta ?? 0;
                const newLp    = lpResult.ranked_lp ?? 0;
                const newTier  = lpResult.ranked_tier ?? "";
                const streak   = lpResult.win_streak ?? 0;
                const shield   = lpResult.demotion_shield ?? 0;
                const sign     = delta >= 0 ? "+" : "";
                const streakLine = streak >= 3 ? `\n🔥 ${streak}-win streak!` : "";
                const shieldLine = shield > 0 && delta < 0 ? "\n🛡 Demotion shield absorbed this loss." : "";

                // Patch the already-shown modal message to append LP info
                if (modal.open) {
                  modal.message =
                    (modal.message || "") +
                    `\n\n${sign}${delta} LP  →  ${newLp} LP  [${newTier.charAt(0).toUpperCase() + newTier.slice(1)}]` +
                    streakLine + shieldLine;
                }

                // Refresh profile stats reactively
                memberStats.ranked_lp       = newLp;
                memberStats.ranked_tier     = newTier;
                memberStats.ranked_peak_lp  = lpResult.ranked_peak_lp ?? memberStats.ranked_peak_lp;
                memberStats.win_streak      = streak;
                memberStats.demotion_shield = shield;
                memberStats.placement_games = lpResult.placement_games ?? memberStats.placement_games;
              }
            } catch { /* non-fatal — LP display is cosmetic */ }
          }

        } catch (e) {
          console.warn("[pbMatch] gameover record failed:", e?.message ?? e);
        }
      })();
    }

    // ✅ FIX (Bug 3): Schedule background lobby cleanup after game over.
    // Without this, if neither player clicks "Main Menu" or "Play Again", the lobby
    // stays in the DB indefinitely with status="playing" & phase="gameover".
    // Although status="playing" lobbies aren't reused by Quick Match, this clutter
    // can accumulate and cause confusion. Delete it after 10 minutes of inactivity.
    if (isOnline.value && online.lobbyId) {
      const lobbyIdSnapshot = online.lobbyId;
      setTimeout(async () => {
        // Only delete if the game is STILL over and we're still in this match
        // (not already cleaned up by leave/rematch).
        if (online.lobbyId !== lobbyIdSnapshot) return;
        if (game.phase !== "gameover") return;
        try {
          await sbDeleteLobby(lobbyIdSnapshot);
        } catch {
          try { await sbCloseAndNukeLobby(lobbyIdSnapshot, { terminateReason: "ended", reason: "gameover_timeout" }); } catch {}
        }
      }, 10 * 60 * 1000); // 10 minutes
    }
  }

watch(
  () => [game.phase, JSON.stringify(game.rematch), game.rematchDeclinedBy],
  () => {
    if (!isOnline.value) return;
    if (game.phase !== "gameover") return;

    // If opponent requests after your gameover modal is already open,
    // update it live to the Accept/Decline prompt.
    ensureRematchPrompt();

    if (game.rematchDeclinedBy) {
      stopAndExitToMenu("Rematch declined. Game terminated.");
      return;
    }

    if (game.rematch?.[1] && game.rematch?.[2]) {
      closeModal();
      onResetClick();
    }
  }
);

/* =========================
   Quick Match handlers
========================= */
async function refreshPublicLobbies() {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  loadingPublic.value = true;
  try {
    const rows = await sbListPublicWaitingLobbies();
    const list = Array.isArray(rows) ? rows : [];

    // ✅ Clean up empty/expired lobbies so they don't stay joinable.
    // Run best-effort deletes in the background of this refresh.
    for (const l of list) {
      // If a row has 0/2 or is expired, delete/close it.
      if (lobbyPlayerCount(l) === 0 || isLobbyExpired(l)) {
        cleanupLobbyIfNeeded(l, { reason: "list_refresh" });
      }
    }

    // Only show lobbies that are still valid for joining (and NOT quick-match hidden rooms).
    publicLobbies.value = list.filter((l) => {
      if (!(lobbyPlayerCount(l) > 0) || isLobbyExpired(l)) return false;
      const name = String(l?.lobby_name || "");
      if (name === "__QM__") return false;
      const meta = l?.state?.meta || {};
      if (meta?.kind === "quickmatch") return false;
      return true;
    });
  } catch (e) {
    showModal({
      title: "Refresh Failed",
      tone: "bad",
      message: String(e?.message || e || "Could not load public lobbies."),
    });
  } finally {
    loadingPublic.value = false;
  }
}


async function refreshMyPrivateLobbies() {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  loadingPrivate.value = true;
  try {
    const me = await getGuestId();
    // Your own waiting private lobbies (so you can re-enter / copy code)
    const q = [
      "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
      "status=eq.waiting",
      "is_private=eq.true",
      `host_id=eq.${encodeURIComponent(me)}`,
      "order=updated_at.desc",
      "limit=20",
    ].join("&");

    const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: await sbHeaders() });
    if (!res.ok) throw new Error(`List private lobbies failed (${res.status})`);
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];
    myPrivateLobbies.value = list.filter((l) => lobbyPlayerCount(l) > 0 && !isLobbyExpired(l));
  } catch {
    myPrivateLobbies.value = [];
  } finally {
    loadingPrivate.value = false;
  }
}

function normalizeCode(s) {
  return String(s || "").trim().toUpperCase();
}

async function joinPublicLobby(lobby) {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  try {
    showModal({ title: "Joining...", tone: "info", message: `Joining lobby...\nCode: ${lobby?.code || "—"}` });

    // Re-check freshness so you can't join an expired lobby from a stale list.
    const fresh = await sbSelectLobbyById(lobby.id);
    if (!fresh || isLobbyExpired(fresh) || fresh.guest_id) {
      closeModal();
      // Best-effort cleanup so it won't appear again.
      if (fresh) cleanupLobbyIfNeeded(fresh, { reason: "join_public_expired" });
      showModal({ title: "Lobby Expired", tone: "bad", message: "That lobby is no longer available." });
      await refreshPublicLobbies();
      return;
    }

    const joined = await sbJoinLobby(lobby.id);
    if (!joined) {
      closeModal();
      showModal({ title: "Join Failed", tone: "bad", message: "Someone else joined first, or the lobby was closed." });
      await refreshPublicLobbies();
      return;
    }
    closeModal();
    showModal({ title: "Joined!", tone: "good", message: `Connected.\nCode: ${lobby?.code || "—"}` });
    startPollingLobby(lobby.id, "guest");
  } catch (e) {
    closeModal();
    showModal({ title: "Join Failed", tone: "bad", message: String(e?.message || e || "Could not join lobby.") });
  }
}

async function joinByCode() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  const code = normalizeCode(quick.joinCode);
  if (!code) {
    showModal({ title: "Enter a Code", tone: "bad", message: "Type a lobby code first (example: PB-AB12CD34)." });
    return;
  }

  try {
    showModal({ title: "Searching Code...", tone: "info", message: `Looking up lobby...\n${code}` });

    const lobby = await sbSelectLobbyByCode(code);
    if (!lobby) {
      closeModal();
      showModal({ title: "Not Found", tone: "bad", message: `No lobby exists with code:\n${code}` });
      return;
    }

    // ✅ Don't allow joining expired/closed lobbies.
    if (isLobbyExpired(lobby)) {
      closeModal();
      cleanupLobbyIfNeeded(lobby, { reason: "join_by_code_expired" });
      showModal({ title: "Lobby Expired", tone: "bad", message: "That lobby is expired or closed." });
      return;
    }

    if (lobby.guest_id) {
      closeModal();
      showModal({ title: "Lobby Full", tone: "bad", message: "That lobby already has a guest." });
      return;
    }

    const joined = await sbJoinLobby(lobby.id);
    if (!joined) {
      closeModal();
      showModal({
        title: "Join Failed",
        tone: "bad",
        message: "Could not join. The lobby may have closed, expired, or someone joined first.",
      });
      return;
    }
    closeModal();
    showModal({ title: "Joined!", tone: "good", message: `Connected.\nCode: ${lobby.code || code}` });

    startPollingLobby(lobby.id, "guest");
  } catch (e) {
    closeModal();
    showModal({ title: "Join by Code Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}

async function quickMake(timerMinutes = 3) {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  // ✅ Require a lobby name (prevents null/empty name DB errors)
  const nm = String(quick.lobbyName || "").trim();
  if (!nm) {
    showModal({ title: "Lobby Name Required", tone: "bad", message: "Please enter a lobby name before creating one." });
    return;
  }

  const mode = lobbyModeOption.value;
  const extraMeta = mode === "mirror_war"
    ? { kind: "mirror_war", timerMinutes: Number(timerMinutes) || 3 }
    : mode === "blind_draft"
      ? { kind: "blind_draft", timerMinutes: Number(timerMinutes) || 3 }
      : { timerMinutes: Number(timerMinutes) || 3 };
  const modeArg = mode !== "normal" ? mode : null;

  try {
    showModal({ title: "Creating Lobby...", tone: "info", message: "Setting up your room..." });

    const created = await sbCreateLobby({
      isPrivate: quick.isPrivate,
      lobbyName: nm,
      extraStateMeta: extraMeta,
      ...(modeArg ? { mode: modeArg } : {}),
    });

    closeModal();

    if (!created?.id) throw new Error("Lobby created but no ID returned.");

    if (created.code) {
      try {
        await navigator.clipboard.writeText(created.code);
      } catch {}
    }

    showModal({
      title: "Lobby Ready",
      tone: "good",
      message: `Lobby Code: ${created.code || "—"}\n\n${
        created.is_private ? "This is PRIVATE. Only people with the code can join." : "This is PUBLIC. It will appear in matchmaking."
      }\n\n(Code copied if your browser allowed it.)`,
    });

    if (!created.is_private) await refreshPublicLobbies();

    startPollingLobby(created.id, "host", modeArg || null);
  } catch (e) {
    closeModal();
    showModal({ title: "Create Lobby Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}

async function goLobby() {
  screen.value = "lobby";
  await refreshLobby();
}

async function refreshLobby() {
  await Promise.all([refreshPublicLobbies(), refreshMyPrivateLobbies()]);
}

function lobbyCreate() {
  // Show timer picker before creating the lobby
  showModal({
    title: "MATCH TIMER",
    tone: "info",
    message: "Choose the battle clock duration for each player.\nThis applies to both players in the match.",
    actions: [
      { label: "3 MIN", tone: "primary", onClick: () => quickMake(3) },
      { label: "5 MIN", tone: "primary", onClick: () => quickMake(5) },
      { label: "7 MIN", tone: "primary", onClick: () => quickMake(7) },
      { label: "CANCEL", tone: "soft" },
    ],
  });
}

async function lobbySearchOrJoin() {
  const term = String(quick.joinCode || "").trim();
  if (!term) {
    showModal({ title: "Missing Input", tone: "bad", message: "Please type code or lobby name first." });
    return;
  }

  // If it looks like a code, treat it as code.
  const looksLikeCode = /^PB-[A-Z0-9]{8}$/i.test(term) || /^[A-Z0-9]{6,10}$/i.test(term);
  if (looksLikeCode) {
    quick.joinCode = term.toUpperCase().startsWith("PB-") ? term.toUpperCase() : term.toUpperCase();
    await joinByCode();
    return;
  }

  // Otherwise, try to find a public room by name (client-side filter over current list).
  const list = Array.isArray(publicLobbies.value) ? publicLobbies.value : publicLobbies;
  const found = (list || []).find((l) => String(l?.lobby_name || "").toLowerCase().includes(term.toLowerCase()));
  if (found) {
    await joinPublicLobby(found);
    return;
  }

  // If not in the current list, try the server (helps when list is stale / you just refreshed).
  try {
    if (await ensureSupabaseReadyOrExplain()) {
      const srv = await sbFindPublicLobbyByName(term);
      if (srv) {
        await joinPublicLobby(srv);
        return;
      }
    }
  } catch {
    // ignore and fall back to "does not exist"
  }

  showModal({ title: "Not Found", tone: "bad", message: "Lobby does not exist." });
}

function copyCode(code) {
  const c = String(code || "").trim();
  if (!c) return;
  try {
    navigator.clipboard?.writeText?.(c);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = c;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {}
  }
}


async function startQuickMatchAuto() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  // Visible timer + 60s timeout.
  const t0 = Date.now();
  let hostLobbyId = null;
  let cancelled = false;

  const fmt = (s) => {
    const ss = Math.max(0, Math.floor(s));
    const mm = String(Math.floor(ss / 60)).padStart(2, "0");
    const rr = String(ss % 60).padStart(2, "0");
    return `${mm}:${rr}`;
  };

  const updateModal = () => {
    const sec = (Date.now() - t0) / 1000;
    modal.message = `Finding opponent… ${fmt(sec)}`;
  };

  let uiTimer = null;

  showModal({
    title: "Quick Match",
    tone: "info",
    message: "Finding opponent… 00:00",
    actions: [
      {
        label: "CANCEL",
        tone: "soft",
        onClick: async () => {
          cancelled = true;
          try {
            if (hostLobbyId) await sbDeleteLobby(hostLobbyId);
          } catch {}
          if (uiTimer) window.clearInterval(uiTimer);
          closeModal();
          showModal({ title: "Matchmaking", tone: "bad", message: "match making cancelled" });
        },
      },
    ],
  });

  uiTimer = window.setInterval(() => {
    if (!modal.open) return;
    updateModal();
  }, 250);

  // Guard against rare hangs / stalled fetches.
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Quick Match timed out")), ms))]);

  try {
    // ✅ FIX: Small random jitter (0–600ms) before the first search.
    // When two players click Quick Match at the exact same time, they both query
    // the empty queue simultaneously and both create host lobbies. The jitter
    // staggers their searches so one is likely to find the other's lobby first.
    await new Promise(r => setTimeout(r, Math.random() * 600));
    if (cancelled) return;

    let result;
    try {
      result = await withTimeout(sbQuickMatch(), 9000);
    } catch {
      // One retry after a short delay.
      await new Promise((r) => setTimeout(r, 600));
      result = await withTimeout(sbQuickMatch(), 9000);
    }

    if (cancelled) return;

    const { lobby, role } = result;

    // If we're the guest (found someone waiting), run the 10s accept flow first.
    if (role === "guest") {
      if (uiTimer) window.clearInterval(uiTimer);
      closeModal();

      const ok = await quickMatchAcceptFlow(lobby.id, "guest");
      if (!ok) return;

      screen.value = "online";
      startPollingLobby(lobby.id, "guest");
      return;
    }

    // If we're the host, stay in the modal until someone joins (no more "Match Found" → waiting confusion).
    hostLobbyId = lobby?.id || null;
    // ✅ FIX (cross-join): remember when OUR lobby was created so late-merge only
    // joins lobbies that are STRICTLY OLDER than ours. Without this, two simultaneous
    // hosts each join the other's lobby at the same time, both delete the lobby the
    // other just joined, and both accept flows silently fail ("Lobby not found" is
    // swallowed by the late-merge catch), leaving both players polling deleted lobbies
    // until the 60 s timeout.
    const myLobbyUpdatedAt = lobby?.updated_at ?? new Date().toISOString();

    const waitUntil = Date.now() + 60_000;
    let qmLoopCount = 0;
    while (!cancelled && Date.now() < waitUntil) {
      updateModal();
      qmLoopCount++;

      // Check if someone joined our lobby.
      const fresh = hostLobbyId ? await sbSelectLobbyById(hostLobbyId) : null;
      if (fresh?.guest_id) {
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();

        const ok = await quickMatchAcceptFlow(hostLobbyId, "host");
        if (!ok) return;

        screen.value = "online";
        startPollingLobby(hostLobbyId, "host");
        return;
      }

      // ✅ FIX: Late-merge to handle simultaneous-start race condition.
      // When two players both click Quick Match at the same time, both find an empty queue
      // and both create host lobbies. Without this check they'd wait forever.
      // Every ~2.5 seconds, scan for OTHER waiting QM lobbies and volunteer to be the guest.
      if (qmLoopCount % 3 === 0 && hostLobbyId && !cancelled) {
        try {
          const meId = await getGuestId();
          const lmQ = [
            "select=id,code,status,updated_at,host_id,guest_id,state,version",
            "status=eq.waiting",
            "is_private=eq.false",
            "guest_id=is.null",
            "mode=eq.quick",
            `host_id=neq.${encodeURIComponent(meId)}`,
            "order=updated_at.asc",
            "limit=5",
          ].join("&");
          const lmRes = await fetch(sbRestUrl(`pb_lobbies?${lmQ}`), { headers: await sbHeaders() });
          if (lmRes.ok) {
            const lmRows = await lmRes.json();
            const myTs = parseIsoMs(myLobbyUpdatedAt);
            const others = (Array.isArray(lmRows) ? lmRows : []).filter(l => {
              if (!l || l.id === hostLobbyId || l.host_id === meId) return false;
              if (isLobbyExpired(l)) return false;
              // ✅ FIX (cross-join): only join a lobby that is OLDER than ours.
              // If both players scan simultaneously they see each other's lobby, but
              // only the one whose lobby is NEWER will pass this check and join.
              // The one with the OLDER lobby simply waits for the other to join them.
              // Tiebreak by lobby ID so exactly one side wins when timestamps are equal.
              const targetTs = parseIsoMs(l.updated_at);
              if (targetTs < myTs) return true;
              if (targetTs > myTs) return false;
              return String(l.id) < String(hostLobbyId); // equal ts: smaller ID wins
            });
            if (others.length > 0 && !cancelled) {
              // Another host is waiting — join their lobby as guest and close ours
              const target = others[0];
              const joined = await sbJoinLobby(target.id);
              if (joined?.id) {
                try { await sbDeleteLobby(hostLobbyId); } catch {}
                hostLobbyId = null;
                if (uiTimer) window.clearInterval(uiTimer);
                closeModal();
                const ok = await quickMatchAcceptFlow(joined.id, "guest");
                if (!ok) return;
                screen.value = "online";
                startPollingLobby(joined.id, "guest");
                return;
              }
            }
          }
        } catch { /* ignore — keep polling as host */ }
      }

      await new Promise((r) => setTimeout(r, 850));
    }

    if (cancelled) {
      // User cancelled: do not show timeout / "No one is playing" flow.
      return;
    }

    // Timeout: no opponent.
    if (uiTimer) window.clearInterval(uiTimer);
    try {
      if (hostLobbyId) await sbDeleteLobby(hostLobbyId);
    } catch {}
    closeModal();
    showModal({
      title: "No Opponent",
      tone: "bad",
      message: "No one is playing right now.",
      actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "mode") }],
    });
  } catch (e) {
    if (uiTimer) window.clearInterval(uiTimer);
    closeModal();
    showModal({ title: "Quick Match Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}


async function sbEnsureQuickMatchAcceptState(lobbyId) {
  const fresh = await sbSelectLobbyById(lobbyId);
  if (!fresh) throw new Error("Lobby not found");
  const now = Date.now();
  const st = normalizeLobbyState(fresh.state);
  const qa = st.qmAccept;

  // Start a new accept window if missing / invalid / expired.
  if (!qa || !qa.expiresAt || Number(qa.expiresAt) <= now) {
    const startedAt = now;
    const expiresAt = now + 10_000;
    st.qmAccept = { startedAt, expiresAt, host: null, guest: null, declinedBy: null };

    const nextVersion = Number(fresh.version || 0) + 1;
    await sbPatchStateWithVersionGuard(fresh.id, fresh.version, {
      state: st,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });

    return { ...st.qmAccept, version: nextVersion };
  }

  return { ...qa, version: Number(fresh.version || 0) };
}

async function sbSetQuickMatchAccept(lobbyId, role, accepted) {
  // ✅ FIX: Retry up to 3 times on version conflict.
  // Previously a single version-guarded write with no retry meant that if two clients
  // wrote accept state simultaneously, one silently lost their click.
  for (let attempt = 0; attempt < 3; attempt++) {
    const fresh = await sbSelectLobbyById(lobbyId);
    if (!fresh) return null;
    const st = normalizeLobbyState(fresh.state);

    // Ensure accept window exists
    if (!st.qmAccept || !st.qmAccept.expiresAt) {
      st.qmAccept = { startedAt: Date.now(), expiresAt: Date.now() + 10_000, host: null, guest: null, declinedBy: null };
    }

    if (accepted === true) {
      st.qmAccept[role] = true;
    } else {
      st.qmAccept[role] = false;
      st.qmAccept.declinedBy = role;
    }

    const nextVersion = Number(fresh.version || 0) + 1;
    const result = await sbPatchStateWithVersionGuard(fresh.id, fresh.version, {
      state: st,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });
    if (result) return result;
    // Version conflict — brief pause then retry with fresh read
    if (attempt < 2) await new Promise(r => setTimeout(r, 150 + attempt * 100));
  }
  return null;
}

async function quickMatchAcceptFlow(lobbyId, role) {
  // Ensure we have a shared 10s accept window.
  const qa = await sbEnsureQuickMatchAcceptState(lobbyId);
  const expiresAt = Number(qa.expiresAt) || (Date.now() + 10_000);

  qmAccept.open = true;
  qmAccept.lobbyId = lobbyId;
  qmAccept.role = role;
  qmAccept.expiresAt = expiresAt;
  qmAccept.myAccepted = false;
  qmAccept.statusLine = "";

  let done = false;
  let ok = false;
  /** @type {"self_timeout"|"self_decline"|"opponent_not_accept"|"unknown"} */
  let failReason = "unknown";
  let skipFailModal = false;

  const tick = () => {
    if (!qmAccept.open) return;
    const rem = Math.max(0, qmAccept.expiresAt - Date.now());
    qmAccept.remainingMs = rem;
    qmAccept.progress = Math.max(0, Math.min(1, rem / 10_000));
    qmAccept.pulse = rem <= 5_000;
  };

  tick();
  const uiInt = window.setInterval(tick, 50);

  // Snapshot before we close the modal (closeQmAccept resets state).
  let myAcceptedSnapshot = false;

  try {
    while (!done) {
      tick();

      // If the user manually declined (qmDecline) we close the overlay.
      // Exit immediately and let qmDecline own the UX messaging.
      if (!qmAccept.open && qmAccept.outcome) {
        failReason = /** @type {any} */ (qmAccept.outcome);
        ok = false;
        done = true;
        skipFailModal = !!qmAccept.silentFail;
        break;
      }

      // Timeout
      if (Date.now() >= qmAccept.expiresAt) {
        myAcceptedSnapshot = !!qmAccept.myAccepted;

        // Mark timeout as decline for this role if we didn't accept.
        if (!qmAccept.myAccepted) {
          failReason = "self_timeout";
          qmAccept.outcome = "self_timeout";
          try {
            await sbSetQuickMatchAccept(lobbyId, role, false);
          } catch {}
        } else {
          // I accepted but the other side didn't.
          failReason = "opponent_not_accept";
          qmAccept.outcome = "opponent_not_accept";
        }

        done = true;
        ok = false;
        break;
      }

      const fresh = await sbSelectLobbyById(lobbyId);
      if (!fresh) {
        done = true;
        ok = false;
        break;
      }

      const st = normalizeLobbyState(fresh.state);
      const q = st.qmAccept || {};
      const hostA = q.host;
      const guestA = q.guest;
      const declinedBy = q.declinedBy;

      // Someone declined / timed out
      if (declinedBy || hostA === false || guestA === false) {
        myAcceptedSnapshot = !!qmAccept.myAccepted;

        if (String(declinedBy || "").toLowerCase() === String(role || "").toLowerCase()) {
          failReason = "self_decline";
        } else if ((role === "host" && hostA === false) || (role === "guest" && guestA === false)) {
          failReason = "self_decline";
        } else {
          failReason = "opponent_not_accept";
        }

        qmAccept.outcome = failReason;

        done = true;
        ok = false;
        break;
      }

      // Both accepted
      if (hostA === true && guestA === true) {
        done = true;
        ok = true;
        break;
      }

      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    window.clearInterval(uiInt);
    closeQmAccept();
  }

  if (!ok) {
    // Cleanup lobby so it doesn't get stuck.
    try {
      await sbDeleteLobby(lobbyId);
    } catch {}

    const msg =
      failReason === "self_timeout"
        ? "Failed to accept match making."
        : failReason === "self_decline"
          ? "You declined the matchmaking."
          : "Opponent did not accept.";

    if (!skipFailModal) {
      // Always return player to menu if accept flow fails.
      screen.value = "multiplayer";
      showModal({
        title: "Match Cancelled",
        tone: "bad",
        message: msg,
        actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "multiplayer") }],
      });
    }
  }

  return ok;
}


async function sbQuickMatch() {
  // Quick Match rooms are hidden from the lobby browser by lobby_name="__QM__"
  const me = await getGuestId();

  // 1) Try to claim the oldest waiting quickmatch room that isn't your own
  const q = [
    "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
    "status=eq.waiting",
    "is_private=eq.false",
    "guest_id=is.null",
    "mode=eq.quick",
    // ✅ FIX: exclude lobbies you created so you can never self-join
    `host_id=neq.${encodeURIComponent(me)}`,
    "order=updated_at.asc",
    "limit=6",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: await sbHeaders() });
  if (!res.ok) throw new Error(`Quick match lookup failed (${res.status})`);
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];

  for (const lobby of list) {
    // Clean up dead rows so they don't get reused by accident
    if (lobbyPlayerCount(lobby) === 0 || isLobbyExpired(lobby)) {
      cleanupLobbyIfNeeded(lobby, { reason: "qm_empty" });
      continue;
    }

    if (isLobbyExpired(lobby)) {
      cleanupLobbyIfNeeded(lobby, { reason: "qm_expired" });
      continue;
    }

    // ✅ FIX (Bug 1 & 2): If a previous quick match already ended/terminated,
    // or if ANY prior game data exists (meta.players set = match was played there),
    // don't ever reuse the lobby. Delete it immediately.
    // Previously only "gameover" phase was checked, but a lobby interrupted mid-game
    // (host tab closed) would have meta.players set without phase="gameover".
    // That stale state caused the new guest to see the old GAME OVER / mid-game board.
    const phase = lobby?.state?.game?.phase;
    const term = lobby?.state?.meta?.terminateReason;
    const hadPriorGame = !!lobby?.state?.meta?.players; // any prior game session
    if (phase === "gameover" || term || hadPriorGame) {
      try {
        const ok = await sbDeleteLobby(lobby.id);
        if (!ok) await sbCloseAndNukeLobby(lobby.id, { terminateReason: phase === "gameover" ? "ended" : "terminated", reason: "qm_stale" });
      } catch {}
      continue;
    }

    if (lobby.host_id === me) continue;

    // Claim it (atomic PATCH guarded by guest_id is null + status waiting)
    const joined = await sbJoinLobby(lobby.id);
    if (joined?.id) return { lobby: joined, role: "guest" };
  }

  // 2) Otherwise, create a new hidden quick match room and wait as host
  const now = Date.now();
  const created = await sbCreateLobby({
    isPrivate: false,
    lobbyName: "__QM__",
    mode: "quick",
    // ✅ FIX (Bug 1): Include an initial heartbeat timestamp in the state.
    // Without this, a host that crashes immediately has no heartbeat, so
    // isLobbyExpired() doesn't flag it as stale for up to 5 minutes (LOBBY_WAITING_TTL_MS).
    // With an upfront heartbeat, the 90s staleness check kicks in quickly if the host vanishes.
    extraStateMeta: { kind: "quickmatch", hidden: true, heartbeat: { host: now } },
  });

  if (!created?.id) throw new Error("Failed to create quick match lobby.");
  return { lobby: created, role: "host" };
}

/* ─── MIRROR WAR ─────────────────────────────────────────────────── */
async function startMirrorWarMode() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  const t0 = Date.now();
  let hostLobbyId = null;
  let cancelled = false;
  let uiTimer = null;

  const fmt = (s) => {
    const ss = Math.max(0, Math.floor(s));
    return `${String(Math.floor(ss/60)).padStart(2,"0")}:${String(ss%60).padStart(2,"0")}`;
  };

  showModal({
    title: "Mirror War",
    tone: "info",
    message: "Finding opponent… 00:00",
    actions: [{
      label: "CANCEL",
      tone: "soft",
      onClick: async () => {
        cancelled = true;
        try { if (hostLobbyId) await sbDeleteLobby(hostLobbyId); } catch {}
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();
      },
    }],
  });

  uiTimer = window.setInterval(() => {
    if (!modal.open) return;
    modal.message = `Finding opponent… ${fmt((Date.now()-t0)/1000)}`;
  }, 250);

  try {
    await new Promise(r => setTimeout(r, Math.random() * 600));
    if (cancelled) return;

    const me = await getGuestId();
    const mwQ = [
      "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
      "status=eq.waiting",
      "is_private=eq.false",
      "guest_id=is.null",
      "mode=eq.mirror_war",
      `host_id=neq.${encodeURIComponent(me)}`,
      "order=updated_at.asc",
      "limit=6",
    ].join("&");
    const res = await fetch(sbRestUrl(`pb_lobbies?${mwQ}`), { headers: await sbHeaders() });
    const rows = res.ok ? await res.json() : [];
    const list = Array.isArray(rows) ? rows : [];

    for (const lobby of list) {
      if (lobbyPlayerCount(lobby) === 0 || isLobbyExpired(lobby) || lobby?.state?.meta?.players) {
        cleanupLobbyIfNeeded(lobby, { reason: "mw_stale" });
        continue;
      }
      if (lobby.host_id === me) continue;
      const joined = await sbJoinLobby(lobby.id);
      if (joined?.id) {
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();
        const ok = await quickMatchAcceptFlow(joined.id, "guest");
        if (!ok) return;
        screen.value = "online";
        startPollingLobby(joined.id, "guest", "mirror_war");
        return;
      }
    }

    // Create host lobby
    const now = Date.now();
    const created = await sbCreateLobby({
      isPrivate: false,
      lobbyName: "__MW__",
      mode: "mirror_war",
      extraStateMeta: { kind: "mirror_war", hidden: true, heartbeat: { host: now } },
    });
    if (!created?.id) throw new Error("Failed to create Mirror War lobby.");
    hostLobbyId = created.id;
    const myLobbyUpdatedAt = created?.updated_at ?? new Date().toISOString();

    const waitUntil = Date.now() + 60_000;
    let qmLoopCount = 0;
    while (!cancelled && Date.now() < waitUntil) {
      qmLoopCount++;
      const fresh = await sbSelectLobbyById(hostLobbyId);
      if (fresh?.guest_id) {
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();
        await sbEnsureQuickMatchAcceptState(hostLobbyId);
        const ok = await quickMatchAcceptFlow(hostLobbyId, "host");
        if (!ok) return;
        screen.value = "online";
        startPollingLobby(hostLobbyId, "host", "mirror_war");
        return;
      }

      // ✅ Late-merge: handle simultaneous-start race condition for Mirror War.
      if (qmLoopCount % 3 === 0 && hostLobbyId && !cancelled) {
        try {
          const meId = await getGuestId();
          const lmQ = [
            "select=id,code,status,updated_at,host_id,guest_id,state,version",
            "status=eq.waiting",
            "is_private=eq.false",
            "guest_id=is.null",
            "mode=eq.mirror_war",
            `host_id=neq.${encodeURIComponent(meId)}`,
            "order=updated_at.asc",
            "limit=5",
          ].join("&");
          const lmRes = await fetch(sbRestUrl(`pb_lobbies?${lmQ}`), { headers: await sbHeaders() });
          if (lmRes.ok) {
            const lmRows = await lmRes.json();
            const myTs = parseIsoMs(myLobbyUpdatedAt);
            const others = (Array.isArray(lmRows) ? lmRows : []).filter(l => {
              if (!l || l.id === hostLobbyId || l.host_id === meId) return false;
              if (isLobbyExpired(l)) return false;
              const targetTs = parseIsoMs(l.updated_at);
              if (targetTs < myTs) return true;
              if (targetTs > myTs) return false;
              return String(l.id) < String(hostLobbyId);
            });
            if (others.length > 0 && !cancelled) {
              const target = others[0];
              const joined = await sbJoinLobby(target.id);
              if (joined?.id) {
                try { await sbDeleteLobby(hostLobbyId); } catch {}
                hostLobbyId = null;
                if (uiTimer) window.clearInterval(uiTimer);
                closeModal();
                const ok = await quickMatchAcceptFlow(joined.id, "guest");
                if (!ok) return;
                screen.value = "online";
                startPollingLobby(joined.id, "guest", "mirror_war");
                return;
              }
            }
          }
        } catch { /* ignore — keep polling as host */ }
      }

      await new Promise(r => setTimeout(r, 850));
    }

    if (!cancelled) {
      if (uiTimer) window.clearInterval(uiTimer);
      try { await sbDeleteLobby(hostLobbyId); } catch {}
      closeModal();
      showModal({ title: "No Opponent", tone: "bad", message: "No one is playing right now.",
        actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "multiplayer") }] });
    }
  } catch (e) {
    if (uiTimer) window.clearInterval(uiTimer);
    closeModal();
    showModal({ title: "Mirror War Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}

/* ─── BLIND DRAFT ────────────────────────────────────────────────── */
async function startBlindDraftMode() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  const t0 = Date.now();
  let hostLobbyId = null;
  let cancelled = false;
  let uiTimer = null;

  const fmt = (s) => {
    const ss = Math.max(0, Math.floor(s));
    return `${String(Math.floor(ss/60)).padStart(2,"0")}:${String(ss%60).padStart(2,"0")}`;
  };

  showModal({
    title: "Blind Draft",
    tone: "info",
    message: "Finding opponent… 00:00",
    actions: [{
      label: "CANCEL",
      tone: "soft",
      onClick: async () => {
        cancelled = true;
        try { if (hostLobbyId) await sbDeleteLobby(hostLobbyId); } catch {}
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();
      },
    }],
  });

  uiTimer = window.setInterval(() => {
    if (!modal.open) return;
    modal.message = `Finding opponent… ${fmt((Date.now()-t0)/1000)}`;
  }, 250);

  try {
    await new Promise(r => setTimeout(r, Math.random() * 600));
    if (cancelled) return;

    const me = await getGuestId();
    const bdQ = [
      "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
      "status=eq.waiting",
      "is_private=eq.false",
      "guest_id=is.null",
      "mode=eq.blind_draft",
      `host_id=neq.${encodeURIComponent(me)}`,
      "order=updated_at.asc",
      "limit=6",
    ].join("&");
    const res = await fetch(sbRestUrl(`pb_lobbies?${bdQ}`), { headers: await sbHeaders() });
    const rows = res.ok ? await res.json() : [];
    const list = Array.isArray(rows) ? rows : [];

    for (const lobby of list) {
      if (lobbyPlayerCount(lobby) === 0 || isLobbyExpired(lobby) || lobby?.state?.meta?.players) {
        cleanupLobbyIfNeeded(lobby, { reason: "bd_stale" });
        continue;
      }
      if (lobby.host_id === me) continue;
      const joined = await sbJoinLobby(lobby.id);
      if (joined?.id) {
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();
        const ok = await quickMatchAcceptFlow(joined.id, "guest");
        if (!ok) return;
        screen.value = "online";
        startPollingLobby(joined.id, "guest", "blind_draft");
        return;
      }
    }

    // Create host lobby
    const now = Date.now();
    const created = await sbCreateLobby({
      isPrivate: false,
      lobbyName: "__BD__",
      mode: "blind_draft",
      extraStateMeta: { kind: "blind_draft", hidden: true, heartbeat: { host: now } },
    });
    if (!created?.id) throw new Error("Failed to create Blind Draft lobby.");
    hostLobbyId = created.id;
    const myLobbyUpdatedAt = created?.updated_at ?? new Date().toISOString();

    const waitUntil = Date.now() + 60_000;
    let qmLoopCount = 0;
    while (!cancelled && Date.now() < waitUntil) {
      qmLoopCount++;
      const fresh = await sbSelectLobbyById(hostLobbyId);
      if (fresh?.guest_id) {
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();
        await sbEnsureQuickMatchAcceptState(hostLobbyId);
        const ok = await quickMatchAcceptFlow(hostLobbyId, "host");
        if (!ok) return;
        screen.value = "online";
        startPollingLobby(hostLobbyId, "host", "blind_draft");
        return;
      }

      // ✅ Late-merge: handle simultaneous-start race condition for Blind Draft.
      if (qmLoopCount % 3 === 0 && hostLobbyId && !cancelled) {
        try {
          const meId = await getGuestId();
          const lmQ = [
            "select=id,code,status,updated_at,host_id,guest_id,state,version",
            "status=eq.waiting",
            "is_private=eq.false",
            "guest_id=is.null",
            "mode=eq.blind_draft",
            `host_id=neq.${encodeURIComponent(meId)}`,
            "order=updated_at.asc",
            "limit=5",
          ].join("&");
          const lmRes = await fetch(sbRestUrl(`pb_lobbies?${lmQ}`), { headers: await sbHeaders() });
          if (lmRes.ok) {
            const lmRows = await lmRes.json();
            const myTs = parseIsoMs(myLobbyUpdatedAt);
            const others = (Array.isArray(lmRows) ? lmRows : []).filter(l => {
              if (!l || l.id === hostLobbyId || l.host_id === meId) return false;
              if (isLobbyExpired(l)) return false;
              const targetTs = parseIsoMs(l.updated_at);
              if (targetTs < myTs) return true;
              if (targetTs > myTs) return false;
              return String(l.id) < String(hostLobbyId);
            });
            if (others.length > 0 && !cancelled) {
              const target = others[0];
              const joined = await sbJoinLobby(target.id);
              if (joined?.id) {
                try { await sbDeleteLobby(hostLobbyId); } catch {}
                hostLobbyId = null;
                if (uiTimer) window.clearInterval(uiTimer);
                closeModal();
                const ok = await quickMatchAcceptFlow(joined.id, "guest");
                if (!ok) return;
                screen.value = "online";
                startPollingLobby(joined.id, "guest", "blind_draft");
                return;
              }
            }
          }
        } catch { /* ignore — keep polling as host */ }
      }

      await new Promise(r => setTimeout(r, 850));
    }

    if (!cancelled) {
      if (uiTimer) window.clearInterval(uiTimer);
      try { await sbDeleteLobby(hostLobbyId); } catch {}
      closeModal();
      showModal({ title: "No Opponent", tone: "bad", message: "No one is playing right now.",
        actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "multiplayer") }] });
    }
  } catch (e) {
    if (uiTimer) window.clearInterval(uiTimer);
    closeModal();
    showModal({ title: "Blind Draft Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}


/* =========================
   NAV
========================= */

function confirmInGame({ title, message, yesLabel = "YES", noLabel = "NO", onYes } = {}) {
  if (!isInGame.value) return onYes?.();
  showModal({
    title: title || "Confirm",
    tone: "info",
    message: message || "Are you sure?",
    actions: [
      { label: noLabel, tone: "soft" },
      { label: yesLabel, tone: "primary", onClick: () => onYes?.() },
    ],
  });
}

function goBack() {
  // If a sub-picker is open, close it first (replaces the removed inline BACK button)
  if (qmPickerOpen.value)    { uiClick(); qmPickerOpen.value = false; return; }
  if (couchPickerOpen.value) { uiClick(); couchPickerOpen.value = false; return; }

  // Multiplayer sub-screens
  if (["lobby", "ranked"].includes(screen.value)) {
    navTo("multiplayer");
    return;
  }
  // Solo sub-screens — puzzle is in-game, confirm before leaving
  if (screen.value === "puzzle") {
    if (game.phase === "gameover") { navTo("solo"); return; }
    confirmInGame({
      title: "Leave Puzzle?",
      message: "Your progress will be lost.",
      yesLabel: "LEAVE",
      noLabel: "KEEP PLAYING",
      onYes: () => { screen.value = "solo"; },
    });
    return;
  }
  // Sub-screens go back to main menu
  if (["leaderboards", "profile"].includes(screen.value)) {
    navTo("mode");
    return;
  }
  // Top-level menu screens → main menu
  if (["multiplayer", "solo", "story", "shop", "settings", "credits"].includes(screen.value)) {
    navTo("mode");
    return;
  }
  // Main menu → welcome
  if (screen.value === "mode") {
    navTo("auth");
    return;
  }
  // In-game back is handled by dedicated buttons (Main Menu / Reset) to avoid desync.
}

async function goAuth() {
  // Determine the right "home" screen based on what game was being played
  const homeScreen = screen.value === 'online'
    ? 'multiplayer'
    : ['ai', 'couch', 'puzzle'].includes(screen.value)
      ? 'solo'
      : 'auth';

  // ✅ If the player is currently in a match, confirm first.
  if (isInGame.value) {
    return confirmInGame({
      title: "Go to Main Menu?",
      message: "Are you sure you want to go back to main menu?",
      yesLabel: "YES",
      noLabel: "NO",
      onYes: async () => {
        if (isOnline.value) await leaveOnlineLobby("main_menu");
        stopPolling();
        myPlayer.value = null;
        navTo(homeScreen);
      },
    });
  }

  if (isOnline.value) await leaveOnlineLobby("main_menu");
  stopPolling();
  myPlayer.value = null;
  navTo(homeScreen);
}

async function goMode() {
  if (isOnline.value) await leaveOnlineLobby("back_to_modes");
  stopPolling();
  myPlayer.value = null;
  navTo("mode");
}

function playAsGuest() {
  loggedIn.value = false;
  navTo("mode");
}

function goQuick() { return goLobby(); }

function goRanked() {
  if (!loggedIn.value) { showLoginRequired("Ranked"); return; }
  screen.value = "ranked";
}

function showLoginRequired(feature = "This feature") {
  showModal({
    title: "Login Required",
    tone: "bad",
    message: `${feature} is only available to registered players.\n\nCreate a free account to unlock ranked mode, leaderboards, puzzle mode, and more.`,
    actions: [
      { label: "LOGIN", tone: "primary", onClick: () => openAuthModal("login") },
      { label: "CANCEL", tone: "secondary" },
    ],
  });
}

function doUndo() {
  if (!game.history?.length) return;
  uiClick();
  game.undoLastMove();
}

const canUndo = computed(() => Array.isArray(game.history) && game.history.length > 0);

function startCouchPlay() {
  stopPolling();
  myPlayer.value = null;
  couchMode.value = "normal";
  screen.value = "couch";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.resetGame();

  tryPlayGameBgm();
}

function startCouchMirrorWar() {
  stopPolling();
  myPlayer.value = null;
  couchMode.value = "mirror_war";
  game.boardW = 15;
  game.boardH = 8;
  game.allowFlip = true;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.startPlacementDirect(ALL_PIECE_KEYS, ALL_PIECE_KEYS, 15, 8);
  game.battleClockInitSec = 480;
  game.battleClockSec = { 1: 480, 2: 480 };
  screen.value = "couch";
  couchPickerOpen.value = false;
  tryPlayGameBgm();
}

function startCouchBlindDraft() {
  stopPolling();
  myPlayer.value = null;
  couchMode.value = "blind_draft";
  const seed = Math.floor(Math.random() * 0xFFFFFFFF);
  const { picks1, picks2 } = randomSplitPieces(ALL_PIECE_KEYS, seed);
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = true;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.startPlacementDirect(picks1, picks2, 10, 6);
  couchPickerOpen.value = false;
  // Show piece split BEFORE entering the game screen so both players can read their pieces
  showModal({
    title: "Blind Draft — Piece Split",
    tone: "info",
    message: `P1 gets: ${picks1.join(" ")}  ·  P2 gets: ${picks2.join(" ")}`,
    actions: [{ label: "LET'S GO", tone: "primary", onClick: () => {
      screen.value = "couch";
      tryPlayGameBgm();
    }}],
  });
}

/* ─── PUZZLE MODE ────────────────────────────────────────────────── */
const PUZZLE_PIECES = ["F","I","L","P","N","T","U","V","W","X","Y","Z"];

function startPuzzleMode() {
  stopPolling();
  _puzzleEndFired = false; // reset double-fire guard for fresh run
  myPlayer.value = null;
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = true;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  // Give P2 a single dummy piece so the store's playerHasAnyMove(2) check
  // after each P1 placement never triggers an immediate gameover.
  // Puzzle exit is handled exclusively by the watcher and Finish button.
  game.startPlacementDirect(PUZZLE_PIECES, ["I"], 10, 6);
  game.currentPlayer = 1;
  screen.value = "puzzle";
  tryPlayGameBgm();
}

const puzzleCellsCovered = computed(() => {
  if (!game.board) return 0;
  let count = 0;
  for (const row of game.board) {
    if (!row) continue;
    for (const cell of row) {
      if (cell !== null && cell !== undefined) count++;
    }
  }
  return count;
});

// Guard against double-fire: the phase watcher and the remaining watcher
// can both call handlePuzzleEnd in the same tick.
let _puzzleEndFired = false;

function handlePuzzleEnd() {
  if (_puzzleEndFired) return;
  _puzzleEndFired = true;

  const covered = puzzleCellsCovered.value;
  const pct = Math.round((covered / 60) * 100);
  const emoji = covered === 60 ? "🎉 PERFECT!" : covered >= 48 ? "⭐ Great!" : covered >= 30 ? "👍 Good effort!" : "💪 Keep practicing!";

  if (game.phase !== "gameover") {
    game.phase = "gameover";
  }

  showModal({
    title: "PUZZLE COMPLETE",
    tone: covered === 60 ? "victory" : "good",
    message: `${emoji}\n\nYou covered ${covered} / 60 cells  (${pct}%)`,
    actions: [
      { label: "Try Again", tone: "primary", onClick: () => { closeModal(); startPuzzleMode(); } },
      { label: "Main Menu", tone: "soft",    onClick: () => { closeModal(); screen.value = "solo"; } },
    ],
  });
}

// ── AI Difficulty state ────────────────────────────────────────────
// 'easy' | 'normal' | 'hard' | 'master' | 'expert'
// ═══════════════════════════════════════════════════════════════════
//  PENTwelve — THE CIRCUIT LIST
//  12 ranked players. One newcomer. Zero backstory.
//  Climb from #12 to #1 and earn your place in the scene.
// ═══════════════════════════════════════════════════════════════════

const STORY_CHAPTERS = [
  // ── LOWER SIX (ranks 12–7) ────────────────────────────────────────
  {
    id: 'dumbie', name: 'DUMBIE', title: 'Walking Tutorial',
    vsaiKey: '12-dumbie', emoji: '⬜', color: '#00C97B', tier: 0,
    personality: 'Walking Tutorial',
    difficulty: 'easy', mode: 'normal', aiAsP1: false,
    preDialogue: [
      '"Okay I\'ve totally watched videos about this. I\'m basically prepared."',
    ],
    postWinDialogue: 'Okay YEAH but I had a really good feeling about that last piece and I think that threw me off.',
    postLoseDialogue: 'SEE?? I said I was getting better! That was way closer than last time. Okay bye good game!!',
  },
  {
    id: 'cyano', name: 'CYANO', title: 'Loverable Narcissist',
    vsaiKey: '11-cyano', emoji: '🩵', color: '#46C0E8', tier: 0,
    personality: 'Loverable Narcissist',
    difficulty: 'easy', mode: 'blind_draft', aiAsP1: false,
    preDialogue: [
      '"I\'m literally top twelve. This is more for my fans than anything."',
    ],
    postWinDialogue: 'I am SO sorry to the newcomer, you played well, I just have a natural gift. It\'s a burden really.',
    postLoseDialogue: 'Okay chat... that did NOT just happen. We\'re not posting this one.',
  },
  {
    id: 'norm', name: 'NORM', title: 'Peaceful Warlord',
    vsaiKey: '10-norm', emoji: '🟩', color: '#1E90FF', tier: 1,
    personality: 'Peaceful Warlord',
    difficulty: 'normal', mode: 'mirror_war', aiAsP1: false,
    preDialogue: [
      '"I don\'t start things. I just finish them."',
    ],
    postWinDialogue: 'No hard feelings. You were in over your head. That\'s not an insult, it\'s just where you are right now.',
    postLoseDialogue: 'Hm. You\'re more patient than I expected. Don\'t waste that.',
  },
  {
    id: 'ohmen', name: 'OHMEN', title: 'Stoic Paranoid',
    vsaiKey: '09-ohmen', emoji: '🟪', color: '#8A6BFF', tier: 1,
    personality: 'Stoic Paranoid',
    difficulty: 'normal', mode: 'normal', aiAsP1: false,
    preDialogue: [
      '"Everyone has a pattern. I already found yours."',
    ],
    postWinDialogue: 'I knew. Three pieces in I knew. You confirmed it on the fifth.',
    postLoseDialogue: 'You broke the pattern. I didn\'t expect that. I\'ll remember it.',
  },
  {
    id: 'teift', name: 'TEIFT', title: 'Just Depressed',
    vsaiKey: '08-teift', emoji: '🔷', color: '#9B5DE5', tier: 1,
    personality: 'Just Depressed',
    difficulty: 'hard', mode: 'blind_draft', aiAsP1: false,
    preDialogue: [
      '"Oh. You\'re here. Okay."',
    ],
    postWinDialogue: 'Oh. I won. ...Cool.',
    postLoseDialogue: 'Doesn\'t matter. Nothing really does.',
  },
  {
    id: 'lilica', name: 'LILICA', title: 'Indecisive Beauty',
    vsaiKey: '07-lilica', emoji: '🩷', color: '#FF47A3', tier: 1,
    personality: 'Indecisive Beauty',
    difficulty: 'hard', mode: 'mirror_war', aiAsP1: false,
    preDialogue: [
      '"Okay aggressive. No wait — actually yeah, aggressive. Final answer."',
    ],
    postWinDialogue: 'WAIT I WON?? I didn\'t even have a plan!! Okay no I totally had a plan. Kind of. Go keep going!!',
    postLoseDialogue: 'Ugh I KNEW I should\'ve gone defensive. I literally said that to myself. Okay rematch someday.',
  },
  // ── UPPER SIX (ranks 6–1) ─────────────────────────────────────────
  {
    id: 'sefia', name: 'SEFIA', title: 'Dangerous Cutie',
    vsaiKey: '06-sefia', emoji: '🌸', color: '#FF4D6D', tier: 2,
    personality: 'Dangerous Cutie',
    difficulty: 'master', mode: 'normal', aiAsP1: false,
    preDialogue: [
      '"I\'ve been watching since your first match. I know your tells."',
    ],
    postWinDialogue: 'You changed your pattern. That was the only right move. I\'ll update my notes.',
    postLoseDialogue: 'You built inward. Again. Bottom-right corner. I wrote it down before the game started.',
  },
  {
    id: 'vlad', name: 'VLAD', title: 'Vegetarian Vampire',
    vsaiKey: '05-vlad', emoji: '🧛', color: '#E63B2E', tier: 2,
    personality: 'Vegetarian Vampire',
    difficulty: 'master', mode: 'blind_draft', aiAsP1: false,
    preDialogue: [
      '"Yes, I\'m a vampire. No, I don\'t drink blood. I\'m vegetarian. Don\'t ask."',
    ],
    postWinDialogue: 'I have lived for centuries and I have never once needed to drink blood to win. Remember that.',
    postLoseDialogue: 'You bested me. Remarkable. I\'ll be thinking about this over my lentil soup tonight.',
  },
  {
    id: 'axia', name: 'AXIA', title: 'Mysterious Extrovert',
    vsaiKey: '04-axia', emoji: '🟡', color: '#F5A623', tier: 3,
    personality: 'Mysterious Extrovert',
    difficulty: 'expert', mode: 'normal', aiAsP1: true,
    preDialogue: [
      '"I\'ve been SO excited for this. People think I\'m easy to read — I love that for me."',
    ],
    postWinDialogue: 'That was so fun!! Also I knew exactly what you were doing from piece three. Amazing match though!!',
    postLoseDialogue: 'Okay WOW. I did not see that coming and I see everything coming. You\'re fascinating. Genuinely.',
  },
  {
    id: 'mumu', name: 'MUMU', title: 'Pentobattle Creator',
    vsaiKey: '03-mumu', emoji: '🟠', color: '#F5A623', tier: 3,
    personality: 'Pentobattle Creator',
    difficulty: 'expert', mode: 'mirror_war', aiAsP1: true,
    preDialogue: [
      '"I BUILT this game and I still don\'t know what you\'ll do. Let\'s GOOO."',
    ],
    postWinDialogue: 'You used my own game against me. That\'s the best thing that\'s ever happened to me. Come back.',
    postLoseDialogue: 'LETS GOOO!! GO GET ZERO!! YOU\'VE LITERALLY GOT THIS I\'M ROOTING FOR YOU!!',
  },
  {
    id: 'grand', name: 'GRAND', title: 'First Loser',
    vsaiKey: '02-grand', emoji: '🥈', color: '#C49A3C', tier: 4,
    personality: 'First Loser',
    difficulty: 'ultimate', mode: 'normal', aiAsP1: true,
    preDialogue: [
      '"Second place, three years straight. I\'ve never lost to anyone but ZERO."',
    ],
    postWinDialogue: 'You\'re the first. Three years and you\'re the first. Whatever comes next — you earned it.',
    postLoseDialogue: 'You were close. Closer than most. That\'s not nothing. But second place knows all about close.',
  },
  {
    id: 'zero', name: 'ZERO', title: 'Legendary AI',
    vsaiKey: '01-zero', emoji: '⚪', color: '#C8C8C8', tier: 4,
    personality: 'Legendary AI',
    difficulty: 'ultimate', mode: 'mirror_war', aiAsP1: true,
    preDialogue: [
      '"Eleven players between you and this seat. I\'ve been watching. Just... curious."',
    ],
    postWinDialogue: 'You\'re close. Real close. Come back when the answer is clearer. I\'ll be here.',
    postLoseDialogue: 'The seat is yours. You didn\'t just beat me — you answered the question. Don\'t forget what it cost.',
  },
];
// ── Story Progress (localStorage) ──────────────────────────────────
const STORY_PROGRESS_KEY = 'pb_circuit_list_v1';

function loadStoryProgress() {
  try {
    const raw = localStorage.getItem(STORY_PROGRESS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        cleared: new Set(saved.cleared || []),
        unlocked: new Set(saved.unlocked || [0]),
        completed: saved.completed || 0,
      };
    }
  } catch {}
  return { cleared: new Set(), unlocked: new Set([0]), completed: 0 };
}

function saveStoryProgress() {
  try {
    localStorage.setItem(STORY_PROGRESS_KEY, JSON.stringify({
      cleared: [...storyProgress.cleared],
      unlocked: [...storyProgress.unlocked],
      completed: storyProgress.completed,
    }));
  } catch {}
}

const storyProgress = reactive(loadStoryProgress());

// 'lower' = ranks 12–7 (idx 0–5), 'upper' = ranks 6–1 (idx 6–11)
const storyPage = ref(storyProgress.completed >= 6 ? 'upper' : 'lower');
const storyDir  = ref('up'); // 'up' = going to upper six, 'down' = going to lower six
function switchStoryPage(target) {
  storyDir.value = target === 'upper' ? 'up' : 'down';
  storyPage.value = target;
}

// ── Story Mode State ────────────────────────────────────────────────
// storyFight: the pre-fight cinematic overlay
const storyFight = reactive({ active: false, chapter: null, index: -1 });

// storyResult: the post-fight result overlay
const storyResult = reactive({
  active: false, won: false,
  quote: '', chapterName: '', chapterIndex: -1,
  nextChapter: null, nextIndex: -1,
  chapterColor: '#C0C0C0', chapterRank: 12,
});

// Track whether the current AI game is a story chapter
const storyMode = reactive({ active: false, chapterIndex: -1 });

// ── Start a Story Chapter ───────────────────────────────────────────
function startStoryChapter(idx) {
  const ch = STORY_CHAPTERS[idx];
  if (!ch) return;
  uiClick();
  sfxStoryAccept(ch.id);
  storyFight.chapter = ch;
  storyFight.index = idx;
  storyFight.active = true;
  _lastMoveFired = false;
}

function launchStoryChapterGame() {
  const ch = storyFight.chapter;
  const idx = storyFight.index;
  storyFight.active = false;

  storyMode.active = true;
  storyMode.chapterIndex = idx;

  aiDifficulty.value = ch.difficulty;
  aiPlayer.value = ch.aiAsP1 ? 1 : 2;
  aiRound.value = 1;
  aiScore.p1 = 0;
  aiScore.p2 = 0;
  stopPolling();
  myPlayer.value = null;

  if (ch.mode === 'normal') {
    _startAiGame();
  } else if (ch.mode === 'blind_draft') {
    _startStoryBlindDraft();
  } else if (ch.mode === 'mirror_war') {
    _startStoryMirrorWar();
  }
}

function declineStoryChapter() {
  storyFight.active = false;
  storyFight.chapter = null;
  storyFight.index = -1;
  // Return to the story/circuit screen
  screen.value = 'story';
}

function _startStoryBlindDraft() {
  screen.value = 'ai';
  const seed = Math.floor(Math.random() * 0xFFFFFFFF);
  const { picks1, picks2 } = randomSplitPieces(ALL_PIECE_KEYS, seed);
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.startPlacementDirect(picks1, picks2, 10, 6);
  tryPlayGameBgm();
}

function _startStoryMirrorWar() {
  screen.value = 'ai';
  game.boardW = 15;
  game.boardH = 8;
  game.allowFlip = allowFlip.value;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.startPlacementDirect(ALL_PIECE_KEYS, ALL_PIECE_KEYS, 15, 8);
  game.battleClockInitSec = 480;
  game.battleClockSec = { 1: 480, 2: 480 };
  tryPlayGameBgm();
}

// ── Handle Story Win/Loss ───────────────────────────────────────────
function handleStoryResult(humanWon) {
  const idx = storyMode.chapterIndex;
  const ch = STORY_CHAPTERS[idx];
  storyMode.active = false;
  storyMode.chapterIndex = -1;

  if (humanWon) {
    sfxStoryWin(ch.id);
    // Mark chapter cleared
    storyProgress.cleared.add(idx);
    // Unlock next chapter
    const nextIdx = idx + 1;
    if (nextIdx < STORY_CHAPTERS.length) {
      storyProgress.unlocked.add(nextIdx);
    }
    // Update completed count
    storyProgress.completed = storyProgress.cleared.size;
    saveStoryProgress();

    const nextCh = nextIdx < STORY_CHAPTERS.length ? STORY_CHAPTERS[nextIdx] : null;
    storyResult.won = true;
    storyResult.quote = ch.postLoseDialogue;  // fallback while Groq loads
    storyResult.chapterName = ch.name;
    storyResult.chapterIndex = idx;
    storyResult.chapterColor = ch.color || '#C0C0C0';
    storyResult.chapterRank = 12 - idx;
    storyResult.nextChapter = nextCh;
    storyResult.nextIndex = nextIdx;
    setTimeout(() => { storyResult.active = true; }, 900);
    _fetchResultQuote(ch, true);
  } else {
    sfxStoryLose(ch.id);
    storyResult.won = false;
    storyResult.quote = ch.postWinDialogue;   // fallback while Groq loads
    storyResult.chapterName = ch.name;
    storyResult.chapterIndex = idx;
    storyResult.chapterColor = ch.color || '#C0C0C0';
    storyResult.chapterRank = 12 - idx;
    storyResult.nextChapter = null;
    storyResult.nextIndex = -1;
    setTimeout(() => { storyResult.active = true; }, 900);
    _fetchResultQuote(ch, false);
  }
}

async function _fetchResultQuote(ch, humanWon) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return;
  const outcome = humanWon
    ? `The human just BEAT you. React in character — defeated, in your voice.`
    : `You just BEAT the human. React in character — victorious, in your voice.`;
  const trashTalkStyle = {
    easy:    "You are clueless and accidentally condescending.",
    cyano:   "You are a narcissist streamer — everything is about you and your fans.",
    norm:    "You are a quiet intimidator — calm, clinical, understated.",
    ohmen:   "You are a paranoid strategist who predicted everything.",
    teift:   "You are depressed and unbothered — barely care either way.",
    lilica:  "You are chaotically indecisive — can't even process the result cleanly.",
    sefia:   "You are a cold observer — cite something you noticed about the opponent.",
    vlad:    "You are a centuries-old vegetarian vampire — eerie calm, odd dietary references.",
    axia:    "You are aggressively cheerful and secretly terrifying.",
    mumu:    "You are the game's creator — this is personal, you built every rule.",
    grand:   "You are the eternal runner-up — this result hits deep.",
    zero:    "You are the undefeated champion — absolute quiet certainty.",
  }[ch.id] || "React in character.";
  try {
    const resp = await fetch('/groq-api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 60,
        messages: [
          { role: 'system', content: `You are ${ch.name}, title: "${ch.title}". ${trashTalkStyle}

Examples of your voice:
${(ch.preDialogue||[]).map(l=>l.replace(/^"|"$/g,'')).join('\n')}

${outcome} ONE sentence, max 15 words. No quotes. No narration. Speak directly.` },
          { role: 'user', content: 'React to the match result.' }
        ]
      })
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text && storyResult.active) storyResult.quote = text;
  } catch(e) { /* keep fallback */ }
}

function closeStoryResult() {
  storyResult.active = false;
}

// Reversed for staircase display: rank #1 at top, rank #12 at bottom
const storyChaptersReversed = STORY_CHAPTERS.map((ch, idx) => ({ ch, idx })).reverse();

const aiDifficulty = ref('easy');

// aiPlayer: which player number the AI controls (1 for grandmaster+, 2 for others)
const aiPlayer = ref(2);
const humanPlayer = computed(() => aiPlayer.value === 2 ? 1 : 2);

// Unlock tracking via localStorage
const UNLOCK_KEY = 'pb_ai_unlocks_v2';
const AI_RANK_ORDER = ['easy', 'normal', 'hard', 'master', 'expert', 'ultimate'];

/* ── AI Draft History (localStorage) ───────────────────────────────
   Tracks the human player's draft picks across the last 10 VS AI games
   so Legendary can identify favourite pieces and prioritise denying them.
   Stored client-side only — no DB needed, no auth required.
──────────────────────────────────────────────────────────────────── */
const AI_DRAFT_HISTORY_KEY = 'pb_ai_draft_history';

function getAiDraftHistory() {
  try {
    const raw = localStorage.getItem(AI_DRAFT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAiDraftHistory(humanPicks, aiWon) {
  try {
    const history = getAiDraftHistory();
    history.unshift({
      humanPicks: [...(humanPicks || [])],
      aiWon: !!aiWon,
      diff: aiDifficulty.value,
      timestamp: Date.now(),
    });
    if (history.length > 10) history.length = 10;
    localStorage.setItem(AI_DRAFT_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function loadUnlocks() {
  try {
    const raw = localStorage.getItem(UNLOCK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { easy: true, normal: false, hard: false, master: false, expert: false, ultimate: false };
}
function saveUnlocks(u) {
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(u)); } catch {}
}

const aiUnlocks = ref(loadUnlocks());

// VS AI picker overlay state
const showVsAiPicker = ref(false);

// AI round tracking
const aiRound = ref(0);
const aiScore = reactive({ p1: 0, p2: 0 }); // human vs AI wins

// Unlock animation state
const unlockAnim = reactive({ active: false, rank: '' });

// Challenge animation state (shown when replaying after clearing all stages)
const challengeAnim = reactive({ active: false, rank: '' });
const RANK_LABELS = { easy:'EASY', normal:'NORMAL', hard:'HARD', master:'MASTER', expert:'EXPERT', ultimate:'ULTIMATE' };
const RANK_DESC = { easy:'The Floor Regular', normal:'Sharpened Strategist', hard:'Master of Patterns', master:'The Territorial God', expert:'Beyond Human Reach', ultimate:'Truly Unbeatable' };

function getNextRank(current) {
  const idx = AI_RANK_ORDER.indexOf(current);
  return idx >= 0 && idx < AI_RANK_ORDER.length - 1 ? AI_RANK_ORDER[idx + 1] : null;
}

function tryUnlockNextDifficulty(wonAsPlayer, winnerNum) {
  if (winnerNum !== humanPlayer.value) return; // human must win
  const current = aiDifficulty.value;
  const next = getNextRank(current);
  if (!next) return;
  if (aiUnlocks.value[next]) return; // already unlocked
  const u = { ...aiUnlocks.value, [next]: true };
  aiUnlocks.value = u;
  saveUnlocks(u);
  // Show unlock animation
  setTimeout(() => {
    unlockAnim.rank = next;
    unlockAnim.active = true;
  }, 1200);
  return true;
}

function closeUnlockAnim() {
  unlockAnim.active = false;
  unlockAnim.rank = '';
}

// ── Legendary Conquered overlay ──────────────────────────────────────────────
const legendaryConqueredAnim = reactive({ active: false });

function closeLegendaryConqueredAnim() {
  legendaryConqueredAnim.active = false;
}
function onLcMainMenu() {
  closeLegendaryConqueredAnim();
  screen.value = 'solo';
}
function onLcPlayAgain() {
  closeLegendaryConqueredAnim();
  // Replay legendary directly, skip challenge intro
  aiDifficulty.value = 'expert';
  aiPlayer.value = 1;
  aiRound.value = 1;
  aiScore.p1 = 0;
  aiScore.p2 = 0;
  stopPolling();
  myPlayer.value = null;
  _startAiGame();
}

function onUnlockMainMenu() {
  closeUnlockAnim();
  screen.value = 'solo';
}

function onUnlockPlayAgain() {
  const rank = unlockAnim.rank;
  closeUnlockAnim();
  nextAiRound();
}

function onUnlockNextBattle() {
  const nextRank = unlockAnim.rank; // the just-unlocked rank IS the next battle
  closeUnlockAnim();
  // Go straight to the game — skip the challenge intro animation
  // so there's no redundant modal chain after the unlock screen.
  aiDifficulty.value = nextRank;
  aiPlayer.value = (nextRank === 'master' || nextRank === 'expert') ? 1 : 2;
  aiRound.value = 1;
  aiScore.p1 = 0;
  aiScore.p2 = 0;
  stopPolling();
  myPlayer.value = null;
  _startAiGame();
}

function startPracticeAi() {
  showVsAiPicker.value = true;
}

function selectAiDifficulty(diff) {
  if (!aiUnlocks.value[diff]) return;
  showVsAiPicker.value = false;
  _launchAi(diff);
}

function _launchAi(diff) {
  aiDifficulty.value = diff;
  // Grandmaster and Legendary play as P1 (human gets P2)
  aiPlayer.value = (diff === 'master' || diff === 'expert') ? 1 : 2;
  aiRound.value = 1;
  aiScore.p1 = 0;
  aiScore.p2 = 0;
  stopPolling();
  myPlayer.value = null;

  // Show challenge intro if player has cleared all stages (legendary unlocked)
  const masterMode = !!aiUnlocks.value['expert'];
  if (masterMode) {
    challengeAnim.rank = diff;
    challengeAnim.active = true;
    // Actual game starts when player taps the challenge overlay
  } else {
    _startAiGame();
  }
}

function _startAiGame() {
  screen.value = "ai";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  try { game.$patch(s => { s.ui.confirmMove = confirmMove.value; }); } catch {}
  game.resetGame();
  tryPlayGameBgm();
}

function closeChallengeAnim() {
  challengeAnim.active = false;
  challengeAnim.rank = '';
  _startAiGame();
}

function nextAiRound() {
  aiRound.value++;
  // Keep aiPlayer consistent with current difficulty
  aiPlayer.value = (aiDifficulty.value === 'master' || aiDifficulty.value === 'expert') ? 1 : 2;
  myPlayer.value = null;
  _startAiGame();
}

/* =========================
   ✅ AI ENGINE WIRING
   All AI logic lives in src/lib/aiEngine.js.
   This section only wires the reactive context and dispatches moves.
========================= */

// Instantiate engine on main thread (used only for draft picks + move generation)
const _ai = createAiEngine({ game, aiPlayer, humanPlayer, aiDifficulty, PENTOMINOES, transformCells, getDraftHistory: getAiDraftHistory });

// ── Web Worker: heavy AI computation runs off the main thread ─────────
// The worker receives the serialised game state and returns the best move,
// so choosePlacement() never blocks the UI thread.
let _aiWorkerInstance = null;
let _aiWorkerMsgCallback = null; // set per-turn; cleared on cancel or result

function _getOrCreateWorker() {
  if (!_aiWorkerInstance) {
    _aiWorkerInstance = new Worker(new URL('./lib/aiWorker.js', import.meta.url), { type: 'module' });
    _aiWorkerInstance.onmessage = ({ data }) => {
      if (data.type === 'MOVE_RESULT' && _aiWorkerMsgCallback) {
        const cb = _aiWorkerMsgCallback;
        _aiWorkerMsgCallback = null;
        cb(data.id, data.move);
      }
    };
    _aiWorkerInstance.onerror = (err) => {
      console.error('[AI Worker] Error:', err);
      // Fallback: run synchronously on main thread
      if (_aiWorkerMsgCallback) {
        const cb = _aiWorkerMsgCallback;
        _aiWorkerMsgCallback = null;
        const moves = _ai.getAllValidMoves();
        const move  = moves.length ? _ai.choosePlacement(moves) : null;
        cb(-1, move);
      }
    };
  }
  return _aiWorkerInstance;
}

// ── Turn coordination ─────────────────────────────────────────────
// Each AI turn gets a unique token. Stale callbacks (from a cancelled
// turn) silently discard their results via the token check.
let _aiTurnToken = 0;
let _aiTimer = null;

function _cancelAiTimer() {
  _aiTurnToken++;                                   // invalidates all in-flight callbacks
  if (_aiTimer) { clearTimeout(_aiTimer); _aiTimer = null; }
  _aiWorkerMsgCallback = null;
}

// ── Main AI move dispatcher ───────────────────────────────────────
function _doAiMove() {
  if (screen.value !== 'ai') return;
  if (game.phase === 'gameover') return;
  const ap = aiPlayer.value;

  // ── DRAFT phase: show taunt → wait → pick ──────────────────────────
  if (game.phase === 'draft' && game.draftTurn === ap) {
    const token = ++_aiTurnToken;
    // ~35% chance to trash-talk during draft, with cooldown
    const willTauntDraft = storyMode.active && Math.random() < 0.35 && (Date.now() - _lastTauntAt > 15000);
    if (willTauntDraft) {
      _lastTauntAt = Date.now();
      _fetchAndShowTaunt('draft_ai_pick');
    }
    const draftDelay = willTauntDraft ? 3200 : 700 + Math.random() * 600;
    _aiTimer = setTimeout(() => {
      if (token !== _aiTurnToken) return;
      if (screen.value !== 'ai' || game.phase !== 'draft' || game.draftTurn !== ap) return;
      const pick = _ai.pickDraftPiece();
      if (pick) game.draftPick(pick);
      if (game.phase === 'draft' && game.draftTurn === ap) {
        _doAiMove();
      }
    }, draftDelay);
    return;
  }

  // ── PLACE phase: show taunt → wait 3s → place ───────────────────────
  if (game.phase === 'place' && game.currentPlayer === ap) {
    const token = ++_aiTurnToken;

    // ~40% chance to trash-talk on AI's turn, with cooldown
    const willTauntBattle = storyMode.active && Math.random() < 0.40 && (Date.now() - _lastTauntAt > 18000);
    if (willTauntBattle) {
      _lastTauntAt = Date.now();
      _fetchAndShowTaunt('battle_ai_turn');
    }

    const boardCopy = game.board.map(row =>
      row.map(cell => cell === null ? null : { player: cell.player, pieceKey: cell.pieceKey })
    );

    let workerMove   = null;
    let delayElapsed = false;
    let workerDone   = false;

    // Apply move only when BOTH the taunt delay and worker are done
    function tryApply() {
      if (token !== _aiTurnToken) return;
      if (!delayElapsed || !workerDone) return;
      if (screen.value !== 'ai' || game.phase !== 'place' || game.currentPlayer !== ap) return;

      const move = workerMove;
      if (!move) return;

      game.selectedPieceKey = move.pk;
      game.rotation         = move.rot;
      game.flipped          = move.flip;
      game.placeAt(move.ax, move.ay);
      game.selectedPieceKey = null;
      game.rotation         = 0;
      game.flipped          = false;
    }

    // Only extend delay if a taunt is showing — must outlast the 5s taunt timer
    const displayDelay = willTauntBattle ? 5500 : 1200 + Math.random() * 800;
    _aiTimer = setTimeout(() => {
      if (token !== _aiTurnToken) return;
      delayElapsed = true;
      tryApply();
    }, displayDelay);

    // 2) Dispatch heavy computation to the Web Worker simultaneously.
    //    The worker usually finishes well before the 3 s timer expires;
    //    the result just waits until delayElapsed = true before being applied.
    const worker = _getOrCreateWorker();
    _aiWorkerMsgCallback = (id, move) => {
      if (token !== _aiTurnToken) return; // stale result — discard
      workerMove = move;
      workerDone = true;
      tryApply();
    };

    worker.postMessage({
      type: 'PICK_MOVE',
      id:   token,
      payload: {
        gameState: {
          board:       boardCopy,
          boardW:      game.boardW,
          boardH:      game.boardH,
          remaining:   { 1: [...(game.remaining[1] || [])], 2: [...(game.remaining[2] || [])] },
          placedCount: game.placedCount,
          allowFlip:   game.allowFlip,
          phase:       game.phase,
          picks:       { 1: [...(game.picks?.[1] || [])], 2: [...(game.picks?.[2] || [])] },
          pool:        [...(game.pool || [])],
        },
        aiPlayerNum:   ap,
        humanPlayerNum: humanPlayer.value,
        difficulty:    aiDifficulty.value,
        draftHistory:  getAiDraftHistory(),
      },
    });
  }
}

watch(
  () => [screen.value, game.phase, game.draftTurn, game.currentPlayer],
  () => {
    if (screen.value !== 'ai') { _cancelAiTimer(); return; }
    if (game.phase === 'gameover') { _cancelAiTimer(); return; }
    const ap = aiPlayer.value;
    const isAiTurn =
      (game.phase === 'draft' && game.draftTurn === ap) ||
      (game.phase === 'place' && game.currentPlayer === ap);
    if (isAiTurn) {
      _cancelAiTimer();
      _doAiMove(); // delay is now managed inside _doAiMove
    } else {
      _cancelAiTimer();
    }
  },
  { immediate: false }
);


function applySettings() {
  saveAudioPrefs();
  saveConfirmMovePref();
  // Apply volumes immediately
  try {
    if (_menuBgm) _menuBgm.volume = bgmVolume.value;
    if (_couchBgm) _couchBgm.volume = bgmVolume.value;
    if (_onlineBgm) _onlineBgm.volume = bgmVolume.value;
  } catch {}

  showModal({
    title: "Settings Applied",
    message: `Allow Flip: ${allowFlip.value ? "ON" : "OFF"}
Drag: ${game.ui.enableDragPlace ? "ON" : "OFF"} · Click: ${game.ui.enableClickPlace ? "ON" : "OFF"} · Hover: ${game.ui.enableHoverPreview ? "ON" : "OFF"}
BGM: ${bgmVolumeUi.value}% · SFX: ${sfxVolumeUi.value}%`,
    tone: "info",
  });
  screen.value = "mode";
}

function applyInGameSettings() {
  saveAudioPrefs();
  try {
    if (_menuBgm) _menuBgm.volume = bgmVolume.value;
    if (_couchBgm) _couchBgm.volume = bgmVolume.value;
    if (_onlineBgm) _onlineBgm.volume = bgmVolume.value;
  } catch {}
  closeInGameSettings();

  // Best-effort resume the correct BGM after applying.
  try {
    if (isInGame.value) tryPlayGameBgm();
    else tryPlayMenuBgm();
  } catch {}
}

/* =========================
   MOUNT / UNMOUNT
========================= */

function isMobileLike() {
  try {
    const ua = String(navigator?.userAgent || "").toLowerCase();
    const touch = (navigator?.maxTouchPoints || 0) > 0;
    const small = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
    return /android|iphone|ipad|ipod|mobile/.test(ua) || (touch && small);
  } catch {
    return false;
  }
}

function maybeWarnMobile() {
  try {
    if (!isMobileLike()) return;
    const key = "pb_mobile_warn_ack";
    const ack = localStorage.getItem(key);
    if (ack === "1") return;

    // Show a one-time warning. If they insist, force landscape lock.
    showModal({
      title: "Mobile Warning",
      tone: "bad",
      message:
        "Mobile detected. This game is designed for desktop.\n\nIf you still want to play on mobile:\n• Enable Desktop Site / Desktop mode\n• Rotate to LANDSCAPE\n\nContinue anyway?",
      actions: [
        {
          label: "Back",
          tone: "soft",
          onClick: () => {
            try { localStorage.setItem(key, "1"); } catch {}
            screen.value = "auth";
          },
        },
        {
          label: "Continue",
          tone: "primary",
          onClick: () => {
            try { localStorage.setItem(key, "1"); } catch {}
            try { game.ui.lockLandscape = true; } catch {}
            closeModal();
          },
        },
      ],
    });
  } catch {}
}

onMounted(() => {
  // ✅ Initial boot gate — prevent accidental clicks before first paint.
  startUiLock({ label: 'Booting…', hint: 'Loading UI, sounds, and neon vibes…', minMs: 750 });

  loadAudioPrefs();
  loadConfirmMovePref();

  // ── PC default: disable Verify Move (requireSubmit) on desktop pointer devices.
  // Mobile/touch devices keep it enabled for the "stage → Submit" flow.
  try {
    const isDesktop = window.matchMedia?.('(pointer: fine)').matches ?? false;
    if (isDesktop) game.ui.requireSubmit = false;
  } catch {}

  // Try to autoplay menu BGM on the welcome/menu screens.
  // Note: some browsers may block autoplay until a user gesture.
  ensureMenuBgm();
  tryPlayMenuBgm();
  // FIX: resume BGM whenever the tab becomes visible again (handles mobile
  // app-switch, screen lock, phone calls, notification overlays, etc.).
  // Also keep a persistent (non-once) pointerdown listener so any future
  // interruption during a match can be recovered by the next tap.
  try {
    _bgmVisibilityHandler = () => {
      try {
        if (document.visibilityState !== 'visible') return;
        if (isInGame.value) tryPlayGameBgm();
        else tryPlayMenuBgm();
      } catch {}
    };
    document.addEventListener('visibilitychange', _bgmVisibilityHandler, { passive: true });

    _bgmPointerHandler = () => {
      try {
        if (isInGame.value) tryPlayGameBgm();
        else tryPlayMenuBgm();
      } catch {}
    };
    window.addEventListener('pointerdown', _bgmPointerHandler, { passive: true });
  } catch {}

  onViewportChange();
  try { window.setTimeout(() => maybeWarnMobile(), 900); } catch {}
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("orientationchange", onViewportChange, { passive: true });
  // Fix 18 — use pointermove so hybrid devices don't fire both mouse and touch
  window.addEventListener("pointermove", onGlobalMouseMove, { passive: true });

  // Esc opens in-game settings.
  escHandler = (e) => {
    try {
      if (e.key !== "Escape") return;
      // Don't steal escape from typing in inputs.
      const tag = String(e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!isInGame.value) return;
      e.preventDefault?.();
      inGameSettingsOpen.value = !inGameSettingsOpen.value;
    } catch {}
  };
  window.addEventListener("keydown", escHandler, { passive: false });
  window.addEventListener("keydown", _pbPanelEscHandler, { passive: true });
  stopUiLockAfterPaint(750);

  originalAlert = window.alert;
  window.alert = (msg) => {
    showModal({
      title: "Illegal Placement",
      message: String(msg || "That placement is not allowed."),
      tone: "bad",
    });
  };

  tickTimer = window.setInterval(() => {
    nowTick.value = Date.now();

    // AI mode: tick battle clock + enforce draft timeout (both directions, Fix 10)
    if (screen.value === 'ai') {
      if (game.phase === 'place') {
        game.tickBattleClock(Date.now());
      } else if (game.phase === 'draft' && game.turnStartedAt) {
        const limitSec = game.turnLimitDraftSec || 30;
        const elapsed = (Date.now() - game.turnStartedAt) / 1000;
        if (elapsed >= limitSec) {
          if (game.draftTurn === humanPlayer.value) {
            game.aiDraftTimeout(humanPlayer.value, aiPlayer.value);
          } else {
            // AI hung (worker froze) — human wins
            game.aiDraftTimeout(aiPlayer.value, humanPlayer.value);
          }
        }
      }
    }

    // Couch MW / BD: tick the battle clock (normal couch has no timer)
    if (screen.value === 'couch' && (couchMode.value === 'mirror_war' || couchMode.value === 'blind_draft')) {
      if (game.phase === 'place') {
        game.tickBattleClock(Date.now());
      }
    }

    // Couch normal mode: no timers, skip all clock logic

    if (!isOnline.value) return;
    if (!myPlayer.value) return;

    // Use server-corrected time for timeout checks to avoid false timeouts from clock drift
    const t = serverNow();
    const changed = game.checkAndApplyTimeout?.(t);
    if (changed) {
      // ✅ FIX (Timeout race): Only the WINNER pushes the timeout gameover state.
      // Previously BOTH clients called pushMyState("timeout") at the same time,
      // creating a race where the version-guard could silently drop one push and a
      // last-second valid move could collide with two simultaneous timeout writes.
      //
      // New approach:
      //   • Winner pushes immediately (they have no incentive to delay)
      //   • Loser acts as a 3-second fallback push in case the winner is briefly offline
      //   • confirmTimeoutWithServer() still validates before either push lands
      // Push strategy depends on termination type:
      // PLACE timeout: winner pushes at 0ms, loser is 3s fallback.
      // DRAFT dodge:   opponent (non-dodger) pushes at 0ms — they have no incentive
      //                to delay. The dodger waits 3s as fallback so a clutch last-second
      //                pick has time to arrive and cancel via confirmTimeoutWithServer().
      const localMoveSeq = Number(game.moveSeq || 0);
      const isDodge    = game.lastMove?.type === "dodged";
      const iAmDodger  = isDodge && myPlayer.value === game.lastMove?.player;
      const iAmWinner  = !isDodge && myPlayer.value === game.winner;
      // Opponent/winner pushes immediately; dodger/loser waits 3s as fallback.
      const pushDelay  = (iAmDodger || (!isDodge && !iAmWinner)) ? 3000 : 0;

      setTimeout(async () => {
        // Abort if the match was resolved another way while we were waiting
        if (game.phase !== "gameover") return;
        const ok = await confirmTimeoutWithServer(localMoveSeq);
        if (!ok) return;
        online.localDirty = true;
        pushMyState("timeout");
      }, pushDelay);
    }
  }, 250);
});

onBeforeUnmount(() => {
  if (originalAlert) window.alert = originalAlert;
  if (tickTimer) window.clearInterval(tickTimer);
  _cancelAiTimer();
  try { window.removeEventListener("resize", onViewportChange); } catch {}
  try { window.removeEventListener("orientationchange", onViewportChange); } catch {}
  try { window.removeEventListener("pointermove", onGlobalMouseMove); } catch {}
  try { if (escHandler) window.removeEventListener("keydown", escHandler); } catch {}
  try { window.removeEventListener("keydown", _pbPanelEscHandler); } catch {}
  try { if (_bgmVisibilityHandler) document.removeEventListener("visibilitychange", _bgmVisibilityHandler); } catch {}
  try { if (_bgmPointerHandler) window.removeEventListener("pointerdown", _bgmPointerHandler); } catch {}
  try { if (_fitRaf) cancelAnimationFrame(_fitRaf); } catch {}
  stopPolling();
});
</script>

<style scoped>



@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Rajdhani:wght@400;500;600;700&display=swap');
/* =========================
   RGB GAME VIBES
========================= */
.app {
  /* Keep the whole app locked to the viewport height so you can't scroll into
     "empty gradient space" on short menu pages. */
  min-height: 100vh;
  height: 100dvh;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: #06060a;
  /* Use ONLY 2 fonts: Orbitron (main) + Rajdhani (secondary). */
  font-family: 'Orbitron', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

/* When the fixed bottom bar is visible, keep layout at exactly 100vh (no extra scroll).
   Padding is compensated by reducing min-height. */
.app.hasBottomBar{
  /* Bottom bar is fixed at 5.208vw for image bars; use that as padding so content never hides behind it. */
  padding-bottom: 5.208vw;
}
/* Auth screen handles its own full-height layout — no padding needed */
.app.hasBottomBar:has(.hpAuth){
  padding-bottom: 0;
}

/* Ensure form controls inherit theme fonts */
.app :deep(button, input, textarea, select){
  font-family: inherit;
  font-size: inherit;
  letter-spacing: inherit;
}

/* Headings use Orbitron-like sci-fi */
.app :is(.title, .heroTitle, .menuTitle, .menuBtnTop, .turnPill, .resultTitle){
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
}

/* Prefer crisp edges on small text + icons */
.app :is(.title, .sub, .menuTitle, .menuHint, .menuBtnTop, .menuBtnSub, .heroBadge) {
  letter-spacing: 0.6px;
}

/* =========================
   LOADING / LOCK OVERLAY
========================= */
.loadOverlay{
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    radial-gradient(1200px 700px at 50% 20%, rgba(0,229,255,0.10), transparent 60%),
    radial-gradient(1000px 600px at 20% 80%, rgba(255,43,214,0.10), transparent 60%),
    rgba(0,0,0,0.72);
  backdrop-filter: blur(12px);
}
.loadCard{
  width: min(560px, 100%);
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(180deg, rgba(18,18,28,0.88), rgba(10,10,16,0.84));
  box-shadow:
    0 18px 80px rgba(0,0,0,0.65),
    0 0 0 1px rgba(0,229,255,0.08) inset,
    0 0 0 1px rgba(255,43,214,0.06);
  padding: 16px;
  animation: popIn .22s ease-out;
}
.loadTop{ display:flex; gap: 12px; align-items:center; }
.loadLogo{
  width: 54px;
  height: 54px;
  object-fit: contain;
  filter:
    drop-shadow(0 10px 22px rgba(0,0,0,0.55))
    drop-shadow(0 0 18px rgba(0,229,255,0.16))
    drop-shadow(0 0 18px rgba(255,43,214,0.12));
}
.loadTitle{ font-size: 16px; font-weight: 900; }
.loadSub{ margin-top: 6px; font-size: 12px; opacity: 0.85; }
.loadBar{
  margin-top: 14px;
  height: 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.35) inset;
}
.loadBarFill{
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(0,229,255,0.9), rgba(255,43,214,0.9));
  box-shadow:
    0 0 18px rgba(0,229,255,0.22),
    0 0 18px rgba(255,43,214,0.18);
}
.loadHint{ margin-top: 12px; font-size: 11px; opacity: 0.78; line-height: 1.4; }

.rotateOverlay{
  position: fixed;
  inset: 0;
  z-index: 65;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0,0,0,0.78);
  backdrop-filter: blur(10px);
}
.rotateCard{
  width: min(420px, 92vw);
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.12);
  background:
    radial-gradient(800px 320px at 50% 0%, rgba(0,229,255,0.16), transparent 70%),
    radial-gradient(800px 320px at 50% 100%, rgba(255,43,214,0.14), transparent 70%),
    rgba(255,255,255,0.04);
  box-shadow: 0 20px 70px rgba(0,0,0,0.65);
  padding: 16px 16px 14px;
  text-align: center;
}
.rotateTitle{ font-weight: 1000; letter-spacing: 1.2px; text-transform: uppercase; font-size: 16px; }
.rotateSub{ margin-top: 6px; opacity: 0.85; font-weight: 700; }

/* ── Soft portrait hint banner ─────────────────────────────────── */
.portraitHint {
  position: fixed;
  top: 72px; /* below top bar */
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(12, 14, 24, 0.90);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 229, 255, 0.08) inset;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: auto;
  max-width: 90vw;
  overflow: hidden;
  text-overflow: ellipsis;
}
.portraitHintIcon { font-size: 18px; flex-shrink: 0; }
.portraitHintText { opacity: 0.92; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.portraitHintDismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.20);
  background: rgba(255,255,255,0.08);
  color: #eaeaea;
  font-size: 12px;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  transition: background 120ms ease;
}
.portraitHintDismiss:hover { background: rgba(255,255,255,0.18); }

/* Transition for the hint */
.portraitHint-enter-active, .portraitHint-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.portraitHint-enter-from, .portraitHint-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}

@keyframes popIn{
  from{ transform: translateY(8px) scale(0.98); opacity: 0; }
  to{ transform: translateY(0) scale(1); opacity: 1; }
}

/* ✅ Big screen border glow per turn */
.turnFrame {
  position: fixed;
  inset: 10px;
  border-radius: 18px;
  pointer-events: none;
  z-index: 30;

  border: 2px solid rgba(255, 255, 255, 0.10);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 12px 60px rgba(0, 0, 0, 0.55);
  opacity: 0.95;
}

.turnFrame.p1 {
  border-color: rgba(0, 229, 255, 0.35);
  box-shadow:
    0 0 0 1px rgba(0, 229, 255, 0.10) inset,
    0 0 26px rgba(0, 229, 255, 0.18),
    0 0 60px rgba(0, 229, 255, 0.12),
    0 20px 70px rgba(0, 0, 0, 0.55);
}

.turnFrame.p2 {
  border-color: rgba(255, 64, 96, 0.38);
  box-shadow:
    0 0 0 1px rgba(255, 64, 96, 0.10) inset,
    0 0 26px rgba(255, 64, 96, 0.18),
    0 0 60px rgba(255, 64, 96, 0.12),
    0 20px 70px rgba(0, 0, 0, 0.55);
}

.turnFrame.end {
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 0 26px rgba(255, 255, 255, 0.12),
    0 0 60px rgba(0, 229, 255, 0.08),
    0 0 60px rgba(255, 43, 214, 0.06),
    0 20px 70px rgba(0, 0, 0, 0.55);
}

/* ── Dev mode toggle button ─────────────────────────────── */
.dev-toggle-btn {
  position: fixed;
  bottom: 14px;
  right: 14px;
  z-index: 9999;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid #2a2a50;
  background: rgba(13, 13, 24, 0.85);
  color: #505080;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: all 0.15s;
  opacity: 0.5;
}
.dev-toggle-btn:hover { opacity: 1; color: #a080ff; border-color: #5030a0; }
.dev-toggle-btn.active {
  opacity: 1;
  background: rgba(60, 20, 120, 0.85);
  color: #c0a0ff;
  border-color: #7c3aed;
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.4);
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  display: none;
}

.bgGradient {
  position: absolute;
  inset: -40%;
  background: conic-gradient(
    from 180deg,
    rgba(255, 0, 128, 0.28),
    rgba(0, 255, 255, 0.24),
    rgba(140, 0, 255, 0.26),
    rgba(0, 255, 128, 0.22),
    rgba(255, 0, 128, 0.28)
  );
  filter: blur(60px);
  animation: spin 14s linear infinite;
  opacity: 0.9;
}

.bgGlow {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 999px;
  filter: blur(70px);
  opacity: 0.35;
  animation: floaty 9s ease-in-out infinite;
}
.bgGlow.g1 { left: -120px; top: 15%; background: rgba(255, 0, 180, 0.55); }
.bgGlow.g2 { right: -140px; top: 5%; background: rgba(0, 255, 255, 0.5); animation-delay: 1.4s; }
.bgGlow.g3 { left: 35%; bottom: -180px; background: rgba(130, 0, 255, 0.5); animation-delay: 2.2s; }

.bgNoise {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(255,255,255,0.35) 0 1px, transparent 1px),
    radial-gradient(circle at 70% 60%, rgba(255,255,255,0.25) 0 1px, transparent 1px),
    radial-gradient(circle at 40% 80%, rgba(255,255,255,0.2) 0 1px, transparent 1px);
  background-size: 180px 180px, 220px 220px, 260px 260px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes floaty {
  0%, 100% { transform: translateY(0px) translateX(0px) scale(1); }
  50% { transform: translateY(-18px) translateX(10px) scale(1.05); }
}

.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  background:
    linear-gradient(180deg, rgba(12,12,20,0.72), rgba(10,10,16,0.46));
  backdrop-filter: blur(12px);
  box-shadow:
    0 10px 40px rgba(0,0,0,0.45),
    0 0 0 1px rgba(0,229,255,0.06) inset,
    0 0 0 1px rgba(255,43,214,0.05);
}

/* In-game header: keep buttons on the top-right */
.topbar:not(.pbBar){ justify-content: space-between; }
.topbar:not(.pbBar) .right{ margin-left: auto; }

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.brandText{
  display:flex;
  align-items:center;
  min-width: 0;
  height: 44px; /* match logoMark so title can scale up without changing topbar height */
}

.topbar .right{
  display:flex;
  align-items:center;
  gap: 10px;
  flex-wrap: wrap;
}
.logoMark {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  box-shadow: none;
}

.floatingLogo{
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(0,229,255,0.18)) drop-shadow(0 0 18px rgba(255,43,214,0.14));
  transform: translateY(-1px);
}

.logoImg{
  width: 42px;
  height: 42px;
  object-fit: contain;
  image-rendering: auto;
  border-radius: 6px;
}

.linkBtn{
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
  text-decoration: underline;
  opacity: .85;
  font-weight: 700;
}
.linkBtn:hover{ opacity: 1; }
.finePrint .sep{ margin: 0 6px; opacity:.5; }
.finePrint{
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.10);
  opacity: .82;
  font-size: 13px;
  line-height: 1.35;
}

/* Main layout */

/* Minor UI: menus had too much gap below the top bar */
.topbar.pbBar ~ .main{ padding-top: 8px; }

/* Only add bottom padding when the fixed bottom bar is visible */
.app.hasBottomBar .main{
  padding-bottom: 84px;
}

/* Main content is the only scroll container (prevents double-scroll + empty scroll). */
.main{
  position: relative;
  z-index: 1;
  padding: 18px;
  flex: 1 1 auto;
  /* Allow vertical scrolling, but never allow horizontal scrollbars
     (menu tiles intentionally overhang to the right for the AAA "off-panel" effect). */
  overflow-y: auto;
  overflow-x: hidden;
}

/* In menu mode: remove right & bottom padding so tiles bleed flush to the viewport edge */
.tetMode .main{
  padding-right: 0;
  padding-bottom: 0;
}

/* In-game: lock the canvas; UI already fits the viewport. */
.app.inGame .main{ overflow: hidden; }
/* Auth screen: lock scroll so hpAuth fills exactly */
.app:has(.hpAuth) .main{ overflow: hidden; }

/* Mobile: allow panning so the desktop-style 2-panel layout stays visible */
@media (max-width: 980px){
  .app.inGame .main{
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    padding: 10px;
    /* Allow finger panning on the scroll container, but the board shell
       overrides with touch-action:none so piece dragging works there. */
    touch-action: pan-x pan-y;
    /* Leave room for the fixed mobile action bar at the bottom */
    padding-bottom: 90px;
  }
  .gameLayout{ height: auto; min-height: calc(100dvh - 80px); }
}

@media (pointer: coarse) {
  /* Same bottom padding for touch devices regardless of width */
  .app.inGame .main {
    padding-bottom: 90px;
  }
}

@media (max-height: 620px){
  .app.inGame .main{ overflow: auto; -webkit-overflow-scrolling: touch; }
  .gameLayout{ height: auto; }
}

.btn{
  /* Shared button look (matches the gray/white menu tile theme) */
  --btnAcc: 255,255,255;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: visible;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  color: #eaeaea;
  font-weight: 900;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  letter-spacing: 0.6px;
  cursor: pointer;
  transition: transform .08s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, opacity .18s ease, filter .18s ease;
  box-shadow:
    0 12px 32px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.06) inset;
}
.btn:hover{
  transform: translateY(-1px);
  border-color: rgba(var(--btnAcc),0.26);
  box-shadow:
    0 16px 40px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.07) inset,
    0 0 18px rgba(var(--btnAcc),0.10);
  filter: brightness(1.03);
}
.btn:active{ transform: translateY(0px) scale(0.99); }

.btn.primary{
  /* "Primary" stays within the same gray/white theme, just brighter. */
  background:
    linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04)),
    linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  border-color: rgba(255,255,255,0.18);
  box-shadow:
    0 16px 42px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.08) inset;
}
.btn.accentBlue{ --btnAcc: 80,170,255; }

.btn.soft{
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
}
/* ── Unified cursor drag ghost ─────────────────────────────────────────────── */
.cursorGhost {
  position: fixed;
  pointer-events: none;
  z-index: 99999;
  opacity: 0.85;
  will-change: left, top;
}

.cursorGhostBlock {
  /* border-radius set inline to match board cell size exactly */
  overflow: hidden;
  position: relative;
}

.cursorGhostBlock::before {
  display: none;
}

.btn.ghost{
  background: transparent;
  box-shadow: none;
}
.menuShell{ max-width: 720px; margin: 0 auto; display: grid; gap: 14px; padding: 6px 0 16px; }

/* Neon tile system (inspired by the reference image) */
.menuShell{
  --neo-cyan: rgba(0, 229, 255, 1);
  --neo-mag: rgba(255, 43, 214, 1);
  --neo-ink: rgba(8, 10, 18, 0.76);
  --neo-ink2: rgba(8, 10, 16, 0.52);
}

.menuCard{
  position: relative;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.10);
  background:
    radial-gradient(900px 420px at 20% 0%, rgba(0,229,255,0.10), transparent 60%),
    radial-gradient(900px 420px at 85% 100%, rgba(255,43,214,0.09), transparent 60%),
    linear-gradient(180deg, rgba(12,12,20,0.62), rgba(10,10,16,0.46));
  backdrop-filter: blur(12px);
  box-shadow:
    0 16px 70px rgba(0,0,0,0.55),
    0 0 0 1px rgba(0,229,255,0.06) inset,
    0 0 0 1px rgba(255,43,214,0.05);
  overflow: hidden;
}
.menuCard::after{
  content:"";
  position:absolute;
  inset:0;
  opacity: 0.22;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 44px),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 44px);
  mix-blend-mode: overlay;
  pointer-events:none;
}

.menuStack{ display: grid; gap: 10px; }
.menuSplitRow{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }

/* Big neon menu tiles (keep your Valorant-ish layout & hover feel, but neon theming) */
.menuBtn{
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 16px;
  line-height: 1.15;
  cursor: pointer;
  font-weight: 900;
  color: #eaeaea;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(74,108,255,0.95), rgba(156,92,255,0.92));
  box-shadow: none;
  filter: none;
  position: relative;
  transform: translateX(0);
  opacity: 1;
  transition: transform 140ms ease, opacity 140ms ease, border-color 140ms ease;
}

/* inner grid + subtle scan sheen */
.menuBtn::after{

  content: none;

}

/* neon edge glow layer */
.menuBtn::before{

  content: none;

}

.menuBtn:hover{
  transform: translateX(-8px);
  opacity: 0.95;
  border-color: rgba(255,255,255,.18);
  box-shadow: none;
  filter: none;
}
.menuBtn:active{

  transform: translateX(-4px) scale(0.99);

}
.menuBtn.primary::before{

  content: none;

}

.menuBtn.alt{
  border-color: rgba(255,255,255,.16);
  background: linear-gradient(135deg, rgba(255,64,160,0.92), rgba(156,92,255,0.92));
  box-shadow: none;
}
.menuBtn.alt::before{

  content: none;

}
.menuBtn.alt:hover{
  box-shadow:
    0 18px 56px rgba(0,0,0,.52),
    0 0 0 1px rgba(255,255,255,0.06) inset,
    0 0 32px rgba(255,43,214,.16);
}

.menuBtn.disabled{ opacity:.45; cursor:not-allowed; filter: grayscale(0.15); }
.menuBtnLeft{ display:flex; gap: 14px; align-items:center; min-width:0; }
.menuBtnIcon{
  width: 42px;
  height: 42px;
  display:grid;
  place-items:center;
  border-radius: 14px;
  background: rgba(0,0,0,0.18);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow:
    0 10px 26px rgba(0,0,0,0.40),
    0 0 0 1px rgba(255,255,255,0.05) inset;
}
.menuBtn.primary .menuBtnIcon{ border-color: rgba(0,229,255,0.18); box-shadow: 0 10px 26px rgba(0,0,0,0.40), 0 0 20px rgba(0,229,255,0.10); }
.menuBtn.alt .menuBtnIcon{ border-color: rgba(255,43,214,0.18); box-shadow: 0 10px 26px rgba(0,0,0,0.40), 0 0 20px rgba(255,43,214,0.10); }

.menuBtnTop{ font-size: 15px; text-transform: uppercase; letter-spacing: 1.2px; }
.menuBtnSub{ font-size: 12px; opacity: .78; font-weight: 700; }
.menuTitleRow{ display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
.menuTitle{ font-size: 14px; font-weight: 900; }
.menuHint{ font-size: 12px; opacity:.7; font-weight: 700; }
.heroTitle{ margin: 0; }
.heroDesc{ opacity:.8; }

/* AAA-style title entrance (auto slide + fade) */
.heroAnim .heroBadge{
  animation: heroBadgeIn .55s cubic-bezier(.2,.9,.2,1) both, heroBadgeIdle 5.5s ease-in-out 1.0s infinite;
}
.heroAnim .heroTitle{
  animation: heroTitleIn .62s cubic-bezier(.2,.9,.2,1) .05s both, heroTitleIdle 6.0s ease-in-out 1.1s infinite;
}
.heroAnim .heroDesc{
  animation: heroDescIn .65s cubic-bezier(.2,.9,.2,1) .10s both;
}

@keyframes heroBadgeIn{
  from{ opacity: 0; transform: translateY(-10px); filter: blur(2px); }
  to{ opacity: 1; transform: translateY(0px); filter: blur(0px); }
}
@keyframes heroTitleIn{
  from{ opacity: 0; transform: translateY(10px); filter: blur(3px); }
  to{ opacity: 1; transform: translateY(0px); filter: blur(0px); }
}
@keyframes heroDescIn{
  from{ opacity: 0; transform: translateY(8px); }
  to{ opacity: .8; transform: translateY(0px); }
}
@keyframes heroBadgeIdle{
  0%,100%{ transform: translateY(0px); opacity: 1; }
  50%{ transform: translateY(-1px); opacity: .92; }
}
@keyframes heroTitleIdle{
  0%,100%{ transform: translateY(0px); }
  50%{ transform: translateY(-2px); }
}
.rgbText{ background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1)); -webkit-background-clip:text; background-clip:text; color: transparent; }
.divider{ height: 1px; background: rgba(255,255,255,.10); margin: 12px 0; }
.chip{ display:inline-flex; align-items:center; gap: 8px; }
.chip.code{ gap: 10px; }
.miniBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding: 7px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,0.22);
  color: #eaeaea;
  font-weight: 900;
  cursor: pointer;
}
.miniBtn:hover{ background: rgba(255,255,255,0.08); }
.field{ display:flex; gap: 12px; align-items:center; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); }
.fieldRow{ justify-content: space-between; cursor: pointer; }
.fieldRow input[type="checkbox"]{ width: 20px; height: 20px; cursor: pointer; accent-color: rgba(0,255,170,0.8); }
.fieldToggle{ justify-content: space-between; }
.fieldToggle > span{ display:flex; flex-direction:column; gap: 3px; }
.fieldDesc{ font-size: 11px; opacity: 0.55; font-weight: 400; }
/* iOS-style toggle */
.toggleBtn{
  flex-shrink: 0;
  width: 46px; height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.10);
  cursor: pointer;
  position: relative;
  transition: background 180ms ease, border-color 180ms ease;
  padding: 0;
}
.toggleBtn.active{
  background: rgba(0,255,140,0.35);
  border-color: rgba(0,255,140,0.55);
}
.toggleThumb{
  position: absolute;
  top: 3px; left: 3px;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: rgba(200,200,200,0.80);
  transition: transform 180ms ease, background 180ms ease;
  display: block;
}
.toggleBtn.active .toggleThumb{
  transform: translateX(20px);
  background: rgba(0,255,140,0.95);
}
.form{ display:grid; gap: 10px; }
.input{ width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#eaeaea; }
.row{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.modalOverlay{
  position: fixed; inset: 0; z-index: 50;
  background:
    radial-gradient(1000px 600px at 50% 20%, rgba(0,229,255,0.07), transparent 60%),
    radial-gradient(900px 520px at 20% 85%, rgba(255,43,214,0.07), transparent 60%),
    rgba(0,0,0,.72);
  display: grid; place-items: center; padding: 18px;
  backdrop-filter: blur(12px);
}

/* ══ RESULT OVERLAY (Victory / Defeat) ══ */
.resultOverlay{
  background:
    radial-gradient(1200px 700px at 50% 30%, rgba(0,229,255,0.12), transparent 60%),
    radial-gradient(800px 500px at 80% 80%, rgba(255,43,214,0.10), transparent 60%),
    rgba(0,0,10,.84);
}
.defeatOverlay{
  background:
    radial-gradient(1200px 700px at 50% 30%, rgba(255,40,80,0.14), transparent 60%),
    radial-gradient(800px 500px at 20% 80%, rgba(255,160,0,0.08), transparent 60%),
    rgba(10,0,0,.86);
}

/* ══ RESULT MODAL CARD ══ */
.resultModal{
  position: relative;
  width: min(580px, 100%);
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(14,14,26,0.97), rgba(8,8,18,0.97));
  backdrop-filter: blur(20px);
  box-shadow:
    0 30px 120px rgba(0,0,0,0.80),
    0 0 0 1px rgba(255,255,255,0.06) inset;
  padding: 36px 32px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
  animation: resultModalIn .42s cubic-bezier(.22,1,.36,1);
}
@keyframes resultModalIn{
  from{ transform: scale(0.88) translateY(20px); opacity: 0; }
  to{ transform: scale(1) translateY(0); opacity: 1; }
}

/* Victory variant */
.resultModal.victory{
  border-color: rgba(0,229,255,0.25);
  box-shadow:
    0 30px 120px rgba(0,0,0,0.80),
    0 0 0 1px rgba(0,229,255,0.10) inset,
    0 0 60px rgba(0,229,255,0.12),
    0 0 40px rgba(255,43,214,0.08);
}
/* Defeat variant */
.resultModal.defeat{
  border-color: rgba(255,40,80,0.25);
  box-shadow:
    0 30px 120px rgba(0,0,0,0.80),
    0 0 0 1px rgba(255,40,80,0.10) inset,
    0 0 60px rgba(255,40,80,0.12);
}
/* Couch P1 */
.resultModal.couchP1{
  border-color: rgba(0,229,255,0.22);
  box-shadow: 0 30px 120px rgba(0,0,0,0.80), 0 0 0 1px rgba(0,229,255,0.08) inset, 0 0 50px rgba(0,229,255,0.10);
}
/* Couch P2 */
.resultModal.couchP2{
  border-color: rgba(255,64,96,0.22);
  box-shadow: 0 30px 120px rgba(0,0,0,0.80), 0 0 0 1px rgba(255,64,96,0.08) inset, 0 0 50px rgba(255,64,96,0.10);
}

/* Aura rings */
.rmAura{
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  animation: rmAuraPulse 3s ease-in-out infinite alternate;
}
.rmAura1{
  width: 500px; height: 200px;
  top: -80px; left: 50%; transform: translateX(-50%);
  background: radial-gradient(ellipse at 50% 50%, rgba(0,229,255,0.22), transparent 70%);
  filter: blur(28px);
}
.rmAura2{
  width: 400px; height: 160px;
  bottom: -60px; left: 50%; transform: translateX(-50%);
  background: radial-gradient(ellipse at 50% 50%, rgba(255,43,214,0.16), transparent 70%);
  filter: blur(24px);
  animation-delay: -1.5s;
}
.resultModal.defeat .rmAura1{ background: radial-gradient(ellipse at 50% 50%, rgba(255,40,80,0.22), transparent 70%); }
.resultModal.defeat .rmAura2{ background: radial-gradient(ellipse at 50% 50%, rgba(255,120,0,0.12), transparent 70%); }
.resultModal.couchP1 .rmAura1{ background: radial-gradient(ellipse at 50% 50%, rgba(0,229,255,0.18), transparent 70%); }
.resultModal.couchP2 .rmAura1{ background: radial-gradient(ellipse at 50% 50%, rgba(255,64,96,0.18), transparent 70%); }
@keyframes rmAuraPulse{
  from{ opacity: .6; transform: translateX(-50%) scale(0.95); }
  to{ opacity: 1; transform: translateX(-50%) scale(1.06); }
}

/* Scanlines */
.rmScanlines{
  position: absolute; inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0,0,0,0.06) 3px,
    rgba(0,0,0,0.06) 4px
  );
  pointer-events: none;
  border-radius: 28px;
}

/* Stamp */
.rmStampWrap{
  position: relative;
  z-index: 2;
  margin-top: 8px;
}
.rmStamp{
  font-size: 72px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -1px;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  text-transform: uppercase;
  background: linear-gradient(135deg, rgba(0,229,255,1) 0%, rgba(180,80,255,1) 50%, rgba(255,43,214,1) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: rmStampIn .5s cubic-bezier(.22,1,.36,1) .1s both;
  filter: drop-shadow(0 0 30px rgba(0,229,255,0.22));
}
.resultModal.defeat .rmStamp{
  background: linear-gradient(135deg, rgba(255,40,80,1) 0%, rgba(255,120,40,1) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  filter: drop-shadow(0 0 30px rgba(255,40,80,0.22));
}
.resultModal.couchP1 .rmStamp{
  background: linear-gradient(135deg, rgba(0,229,255,1), rgba(80,200,255,1));
  -webkit-background-clip: text;
  background-clip: text;
}
.resultModal.couchP2 .rmStamp{
  background: linear-gradient(135deg, rgba(255,64,96,1), rgba(255,43,214,1));
  -webkit-background-clip: text;
  background-clip: text;
}
@keyframes rmStampIn{
  from{ transform: scale(1.18) translateY(-10px); opacity: 0; filter: blur(4px) drop-shadow(0 0 60px rgba(0,229,255,0.4)); }
  to{ transform: scale(1) translateY(0); opacity: 1; filter: drop-shadow(0 0 30px rgba(0,229,255,0.22)); }
}
.rmStampShadow{
  position: absolute;
  inset: 0;
  font-size: 72px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -1px;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  text-transform: uppercase;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255,255,255,0.04);
  transform: translateY(3px) scaleY(0.9);
  filter: blur(6px);
  pointer-events: none;
  opacity: .5;
}

.rmSub{
  font-size: 13px;
  letter-spacing: 4px;
  font-weight: 900;
  text-transform: uppercase;
  opacity: .55;
  margin-top: 6px;
  position: relative;
  z-index: 2;
  animation: rmFadeUp .4s ease-out .3s both;
}
@keyframes rmFadeUp{
  from{ transform: translateY(8px); opacity: 0; }
  to{ transform: translateY(0); opacity: 1; }
}

.rmDivider{
  width: 60px; height: 2px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
  margin: 18px auto 14px;
  position: relative; z-index: 2;
  animation: rmFadeUp .4s ease-out .4s both;
}

.rmBody{
  position: relative; z-index: 2;
  animation: rmFadeUp .4s ease-out .45s both;
  margin-bottom: 20px;
  width: 100%;
}
.rmMsg{
  margin: 0 0 6px 0;
  opacity: .75;
  line-height: 1.55;
  font-size: 13px;
}
.rmMsg:last-child{ margin-bottom: 0; }

/* ── Difficulty tier badge in result modal ── */
.rmDiffBadge{
  display: inline-block;
  padding: 5px 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1.4px;
  opacity: 1;
  border: 1.5px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.25);
  margin-top: 2px;
  text-transform: uppercase;
}
/* Tier 0 – Dumbie: silver mist */
.rmDiffTier0{ border-color: rgba(80,255,120,0.5); background: linear-gradient(90deg, rgba(80,255,120,1), rgba(140,255,180,1)); -webkit-background-clip: text; background-clip: text; color: transparent; box-shadow: 0 0 16px rgba(80,255,120,0.22), inset 0 0 0 1.5px rgba(80,255,120,0.3); }
/* Tier 1 – Elite: cyan */
.rmDiffTier1{
  border-color: rgba(80,170,255,0.5);
  background: linear-gradient(90deg, rgba(80,170,255,1), rgba(140,220,255,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  box-shadow: 0 0 16px rgba(80,170,255,0.22), inset 0 0 0 1.5px rgba(80,170,255,0.3);
}
/* Tier 2 – Tactician: purple */
.rmDiffTier2{
  border-color: rgba(160,80,255,0.5);
  background: linear-gradient(90deg, rgba(160,80,255,1), rgba(210,140,255,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  box-shadow: 0 0 16px rgba(160,80,255,0.22), inset 0 0 0 1.5px rgba(160,80,255,0.3);
}
/* Tier 3 – Grandmaster: orange/gold */
.rmDiffTier3{
  border-color: rgba(255,160,40,0.5);
  background: linear-gradient(90deg, rgba(255,140,40,1), rgba(255,210,80,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  box-shadow: 0 0 16px rgba(255,160,40,0.25), inset 0 0 0 1.5px rgba(255,160,40,0.3);
}
/* Tier 4 – Legendary: red/crimson */
.rmDiffTier4{
  border-color: rgba(255,40,80,0.5);
  background: linear-gradient(90deg, rgba(255,40,80,1), rgba(255,120,80,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  box-shadow: 0 0 16px rgba(255,40,80,0.28), inset 0 0 0 1.5px rgba(255,40,80,0.3);
}

.rmActions{
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  width: 100%;
  position: relative; z-index: 2;
  animation: rmFadeUp .4s ease-out .52s both;
}
.rmBtn{
  flex: 1;
  min-width: 120px;
  padding: 13px 20px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: #eaeaea;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: transform .12s, background .15s, border-color .15s, box-shadow .15s;
  box-shadow: 0 8px 24px rgba(0,0,0,0.40);
}
.rmBtn:hover{
  transform: translateY(-2px);
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.22);
  box-shadow: 0 12px 32px rgba(0,0,0,0.50);
}
.rmBtn:active{ transform: scale(0.98); }
.rmBtnPrimary{
  border-color: rgba(0,229,255,0.35);
  background: rgba(0,229,255,0.12);
  color: rgba(0,229,255,0.95);
  box-shadow: 0 8px 24px rgba(0,0,0,0.40), 0 0 20px rgba(0,229,255,0.08);
}
.rmBtnPrimary:hover{
  border-color: rgba(0,229,255,0.55);
  background: rgba(0,229,255,0.18);
  box-shadow: 0 12px 32px rgba(0,0,0,0.50), 0 0 28px rgba(0,229,255,0.14);
}
.resultModal.defeat .rmBtnPrimary{
  border-color: rgba(255,40,80,0.35);
  background: rgba(255,40,80,0.12);
  color: rgba(255,80,100,0.95);
  box-shadow: 0 8px 24px rgba(0,0,0,0.40), 0 0 20px rgba(255,40,80,0.08);
}
.resultModal.defeat .rmBtnPrimary:hover{
  border-color: rgba(255,40,80,0.55);
  background: rgba(255,40,80,0.18);
}

/* ══ STANDARD MODAL CARD ══ */
.modalCard{
  position: relative;
  width: min(520px, 100%);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(16,16,28,0.96), rgba(10,10,20,0.94));
  backdrop-filter: blur(16px);
  box-shadow:
    0 20px 80px rgba(0,0,0,0.65),
    0 0 0 1px rgba(255,255,255,0.05) inset;
  overflow: hidden;
  animation: popIn .2s cubic-bezier(.22,1,.36,1);
}
.modalCard.modalDanger{
  border-color: rgba(255,64,96,0.18);
  box-shadow: 0 20px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,64,96,0.10) inset, 0 0 32px rgba(255,64,96,0.08);
}

/* Accent stripe at top */
.modalStripe{
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, rgba(0,229,255,0.8), rgba(180,80,255,0.7), rgba(255,43,214,0.8));
}
.modalStripe.bad{ background: linear-gradient(90deg, rgba(255,64,96,0.9), rgba(255,120,40,0.8)); }
.modalStripe.good{ background: linear-gradient(90deg, rgba(0,255,128,0.8), rgba(0,200,255,0.7)); }
.modalStripe.info{ background: linear-gradient(90deg, rgba(0,229,255,0.8), rgba(180,80,255,0.7), rgba(255,43,214,0.8)); }

.modalInner{ padding: 16px 18px 18px; }

.modalHead{
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.modalIconDot{
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgba(0,229,255,0.9);
  box-shadow: 0 0 10px rgba(0,229,255,0.4);
}
.modalIconDot.bad{ background: rgba(255,64,96,0.9); box-shadow: 0 0 10px rgba(255,64,96,0.4); }
.modalIconDot.good{ background: rgba(0,255,128,0.9); box-shadow: 0 0 10px rgba(0,255,128,0.4); }
.modalIconDot.info{ background: rgba(0,229,255,0.9); box-shadow: 0 0 10px rgba(0,229,255,0.4); }
.modalIconDot.victory{
  background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1));
  box-shadow: 0 0 12px rgba(0,229,255,0.35), 0 0 12px rgba(255,43,214,0.25);
  width: 10px; height: 10px;
}
.modalTitle2{
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  opacity: .92;
}

.modalBody{ margin-bottom: 16px; }
.modalMsg{ margin: 0 0 8px 0; opacity: .85; line-height: 1.5; font-size: 14px; }
.modalMsg:last-child{ margin-bottom: 0; }
.modalMsg.muted{ opacity: .5; font-size: 12px; }
.modalActions{ display:flex; gap: 10px; justify-content:flex-end; flex-wrap: wrap; }
.modalXSpacer{ width: 18px; height: 18px; }

/* ══ QM ACCEPT EXTRAS ══ */
.qmCard{ width: min(400px, 100%); }
.qmTimerArea{
  position: relative;
  width: 56px; height: 56px;
  margin: 14px auto 10px;
}
.qmRing{
  width: 56px; height: 56px;
  transform: rotate(-90deg);
}
.qmRingTrack{
  fill: none;
  stroke: rgba(255,255,255,0.08);
  stroke-width: 4;
}
.qmRingFill{
  fill: none;
  stroke: rgba(0,229,255,0.85);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 138.2;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 250ms linear;
  filter: drop-shadow(0 0 6px rgba(0,229,255,0.5));
}
.qmRingFill.danger{
  stroke: rgba(255,64,96,0.9);
  filter: drop-shadow(0 0 6px rgba(255,64,96,0.5));
}
.qmRingNum{
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: rgba(0,229,255,0.95);
}
.qmRingNum.danger{ color: rgba(255,64,96,0.95); }

/* confetti */
.confetti{
  position: fixed; inset: 0;
  pointer-events: none; overflow: hidden; z-index: 51;
}
.confettiPiece{
  position: absolute; top: -20px; border-radius: 3px;
  background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1));
  opacity: 0.95;
  animation: confettiFall var(--t) ease-in forwards;
  animation-delay: var(--d);
  box-shadow: 0 10px 30px rgba(0,0,0,0.40);
}
@keyframes confettiFall{
  0%{ transform: translateX(0) translateY(0) rotate(var(--r)); opacity: 0; }
  8%{ opacity: 1; }
  100%{ transform: translateX(var(--x)) translateY(105vh) rotate(calc(var(--r) + 420deg)); opacity: 0; }
}



/* ============================================================
   VS AI DIFFICULTY PICKER
   ============================================================ */
.vsAiFade-enter-active{ animation: vsAiFadeIn .22s ease-out; }
.vsAiFade-leave-active{ animation: vsAiFadeIn .16s ease-in reverse; }
@keyframes vsAiFadeIn{
  from{ opacity: 0; }
  to{ opacity: 1; }
}

.vsAiOverlay{
  position: fixed; inset: 0; z-index: 60;
  background:
    radial-gradient(ellipse 120% 80% at 50% 0%, rgba(0,160,255,0.10), transparent 60%),
    radial-gradient(ellipse 80% 120% at 80% 100%, rgba(0,80,180,0.12), transparent 60%),
    rgba(4,4,14,0.88);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.vsAiPanel{
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 0;
  animation: vsAiPanelIn .28s cubic-bezier(.22,1,.36,1);
}
@keyframes vsAiPanelIn{
  from{ transform: translateY(30px) scale(0.96); opacity: 0; }
  to{ transform: translateY(0) scale(1); opacity: 1; }
}

.vsAiHeader{
  position: relative;
  text-align: center;
  padding: 0 0 20px;
  overflow: hidden;
}
.vsAiHeaderGlow{
  position: absolute;
  inset: -40px;
  background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(0,160,255,0.22), transparent 70%);
  filter: blur(20px);
  pointer-events: none;
}
.vsAiTitle{
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  background: linear-gradient(90deg, rgba(100,200,255,1), rgba(0,140,255,1), rgba(0,80,200,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  position: relative;
}
.vsAiSubtitle{
  font-size: 12px;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: .45;
  margin-top: 4px;
  position: relative;
}

.vsAiRanks{ display: flex; flex-direction: column; gap: 6px; position: relative; }

/* Hierarchy connector line */
.vsAiRanks::before{
  content: "";
  position: absolute;
  left: 28px;
  top: 30px;
  bottom: 30px;
  width: 2px;
  background: linear-gradient(180deg,
    rgba(80,255,120,0.5),
    rgba(80,170,255,0.5),
    rgba(160,80,255,0.5),
    rgba(255,140,40,0.5),
    rgba(255,40,80,0.5)
  );
  opacity: .35;
}

.vsAiRankCard{
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px 14px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: transform .15s, box-shadow .15s, border-color .15s, background .15s;
  text-align: left;
  overflow: hidden;
}
.vsAiRankCard.locked{
  opacity: .5;
  cursor: not-allowed;
  filter: grayscale(.7);
}
.vsAiRankCard.unlocked:hover{
  transform: translateX(6px) scale(1.02);
}
.vsAiRankCard.unlocked:active{
  transform: translateX(4px) scale(0.99);
}

/* Per-tier accent colors */
.vsAiRankCard.tier0.unlocked{ --t: 80,255,120; }
.vsAiRankCard.tier1.unlocked{ --t: 80,170,255; }
.vsAiRankCard.tier2.unlocked{ --t: 160,80,255; }
.vsAiRankCard.tier3.unlocked{ --t: 255,140,40; }
.vsAiRankCard.tier4.unlocked{ --t: 255,40,80; }

.vsAiRankCard.unlocked{
  border-color: rgba(var(--t), 0.22);
  background: rgba(var(--t), 0.06);
}
.vsAiRankCard.unlocked:hover{
  border-color: rgba(var(--t), 0.45);
  background: rgba(var(--t), 0.12);
  box-shadow: 0 0 28px rgba(var(--t), 0.18), 0 6px 24px rgba(0,0,0,0.4);
}

.vsAiRankGlow{
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 120% 200% at 0% 50%, rgba(var(--t, 255,255,255), 0.08), transparent 60%);
  pointer-events: none;
  opacity: 0;
  transition: opacity .2s;
}
.vsAiRankCard.unlocked:hover .vsAiRankGlow{ opacity: 1; }

.vsAiRankNum{
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  opacity: .25;
  width: 22px;
  flex-shrink: 0;
  z-index: 1;
}
.vsAiRankIcon{ font-size: 22px; flex-shrink: 0; z-index: 1; }
.vsAiLockIcon{ filter: grayscale(1); opacity: .4; }
.vsAiRankInfo{ flex: 1; z-index: 1; }
.vsAiRankLabel{
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(var(--t, 255,255,255), 0.92);
}
.vsAiRankCard.locked .vsAiRankLabel{ color: rgba(255,255,255,0.5); }
.vsAiRankSub{
  font-size: 11px;
  letter-spacing: 1px;
  opacity: .55;
  margin-top: 2px;
}
.vsAiRankSub.locked{ opacity: .35; font-style: italic; }
.vsAiRankArrow{
  font-size: 12px;
  opacity: .4;
  z-index: 1;
  transition: opacity .15s, transform .15s;
}
.vsAiRankCard.unlocked:hover .vsAiRankArrow{
  opacity: .9;
  transform: translateX(4px);
  color: rgb(var(--t, 255,255,255));
}

.vsAiClose{
  margin-top: 16px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 10px;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: color .15s, border-color .15s;
  align-self: center;
  width: 100%;
}
.vsAiClose:hover{
  color: rgba(255,255,255,0.8);
  border-color: rgba(255,255,255,0.25);
}

/* ============================================================
   FRACTURE CIRCUIT — STORY MODE
   ============================================================ */

/* Solo menu button */
.fractureCircuitBtn {
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  margin-bottom: 6px;
}
.fcBtnInner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 215, 0, 0.25);
  background: linear-gradient(135deg, rgba(255,180,0,0.08), rgba(255,40,80,0.08));
  overflow: hidden;
  transition: border-color .2s, background .2s, transform .15s;
}
.fcBtnInner:hover {
  border-color: rgba(255, 215, 0, 0.5);
  background: linear-gradient(135deg, rgba(255,180,0,0.15), rgba(255,40,80,0.14));
  transform: scale(1.02);
}
.fcBtnGlow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 80% 120% at 0% 50%, rgba(255,200,0,0.12), transparent 60%);
  pointer-events: none;
}
.fcBtnIcon { font-size: 28px; z-index: 1; }
.fcBtnText { flex: 1; text-align: left; z-index: 1; }
.fcBtnTitle {
  font-size: 15px; font-weight: 900;
  letter-spacing: 3px; text-transform: uppercase;
  background: linear-gradient(90deg, #ffd700, #ff8c28, #ff2855);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.fcBtnSub { font-size: 11px; letter-spacing: 2px; opacity: .5; margin-top: 2px; }
.fcBtnProgress { text-align: right; z-index: 1; }
.fcBtnProgressNum { display: block; font-size: 18px; font-weight: 900; color: #ffd700; }
.fcBtnProgressLabel { font-size: 9px; letter-spacing: 2px; opacity: .45; }

/* ═══════════════════════════════════════════════════════════
   PENTWELVE — VERSUS AI  (matches figma 1920×1080 reference)
═══════════════════════════════════════════════════════════ */

/* Shell fills the space between app's topbar and bottombar */
.vsaiShell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  position: relative;
}

/* Content area: fills remaining space between bars */
.vsaiContent {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  overflow: hidden;
  min-height: 0;
}

/* Page toggle buttons — inside label, below progress bar */
.vsaiControls {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.vsaiSwitchBtn {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px; font-weight: 900;
  letter-spacing: 2px; text-transform: uppercase;
  padding: 7px 14px;
  border-radius: 3px;
  cursor: pointer;
  opacity: 1;
  background: #0078ff;
  color: #fff;
  border: 1px solid #0099ff;
  transition: background .15s;
}
.vsaiSwitchBtn:hover { background: #0099ff; }

/* ── Staircase ───────────────────────────────────────────── */
/* --rw fills the full content height (no gaps, flush to both bars).
   Bars are 5.208vw each = 10.416vw total. Content = 100vh - 10.416vw.
   6 rows × (rw × 109/630) = content height  →  rw = (100vh−10.416vw) × 0.9633
*/
.vsaiStaircase {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  --rw: min(32.8vw, calc((100vh - 10.416vw) * 0.9633));
}

/* ── Diagonal stair page transitions ───────────────────────────────
   Both the leaving and entering staircases move at the same time
   along the stair's diagonal axis, creating the illusion that
   Lilica/Sefia (and all rows) are one connected strip scrolling through.
   leave-active is absolute so it doesn't push the entering element down.
──────────────────────────────────────────────────────────────────── */
.stair-up-leave-active,
.stair-down-leave-active {
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease;
  position: absolute;
  top: 0; left: 0;
  will-change: transform, opacity;
}
.stair-up-enter-active,
.stair-down-enter-active {
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease;
  will-change: transform, opacity;
}

/* Going UP → upper six */
.stair-up-leave-to   { transform: translate(14vw, -110%); opacity: 0; }
.stair-up-enter-from { transform: translate(-14vw,  110%); opacity: 0; }
.stair-up-leave-from,
.stair-up-enter-to   { transform: translate(0, 0); opacity: 1; }

/* Going DOWN → lower six */
.stair-down-leave-to   { transform: translate(-14vw,  110%); opacity: 0; }
.stair-down-enter-from { transform: translate( 14vw, -110%); opacity: 0; }
.stair-down-leave-from,
.stair-down-enter-to   { transform: translate(0, 0); opacity: 1; }

.vsaiRow {
  position: relative;
  /* all offsets scale proportionally with --rw */
  margin-left: calc((14.6 / 32.8) * var(--rw) + (5 - var(--row)) * (4.58 / 32.8) * var(--rw));
  cursor: pointer;
  line-height: 0;
  transition: filter .15s ease, transform .12s ease;
}
.vsaiRow:not(.vsaiRowLocked):hover {
  filter: brightness(1.14);
  transform: translateX(-5px);
}
.vsaiRow.vsaiRowLocked {
  cursor: not-allowed;
  filter: grayscale(0.4) brightness(0.75);
}
.vsaiRow.vsaiRowActive { filter: brightness(1.06); }

/* Character PNG — width driven by --rw */
.vsaiRowImg {
  display: block;
  width: var(--rw);
  height: auto;
  user-select: none;
}

/* Locked placeholder — same 630×109 aspect ratio, scaled by --rw */
.vsaiRowLock {
  display: flex;
  align-items: center;
  gap: 1.5vw;
  width: var(--rw);
  height: calc(var(--rw) * 109 / 630);
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  padding: 0 2vw;
  box-sizing: border-box;
}
.vsaiRowLockNum {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.6vw; font-weight: 900;
  color: rgba(255,255,255,0.15);
  flex-shrink: 0;
}
.vsaiRowLockText {
  font-family: 'Orbitron', sans-serif;
  font-size: 1vw; font-weight: 700;
  letter-spacing: 0.3vw;
  color: rgba(255,255,255,0.1);
}

/* Cleared checkmark */
.vsaiRowCheck {
  position: absolute;
  top: 0.4vw; right: 0.5vw;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.7vw; font-weight: 900;
  color: #38d282;
  text-shadow: 0 0 6px rgba(56,210,130,0.7);
  pointer-events: none;
}
/* Active challenge arrow */
.vsaiRowArrow {
  position: absolute;
  top: 50%; right: 0.8vw;
  transform: translateY(-50%);
  font-size: 0.8vw;
  color: rgba(255,255,255,0.7);
  animation: vsaiPulse 1s ease-in-out infinite alternate;
  pointer-events: none;
}
@keyframes vsaiPulse {
  from { opacity: 0.3; transform: translateY(-50%) translateX(0); }
  to   { opacity: 1.0; transform: translateY(-50%) translateX(5px); }
}

/* ── PENTWELVE / LOWER/UPPER SIX labels ──────────────────── */
.vsaiLabel {
  position: absolute;
  right: 3vw;
  bottom: 10%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4vw;
  pointer-events: none;
}
.vsaiLabelTitle {
  display: block;
  width: 24vw;
  height: auto;
  flex-shrink: 0;
}
/* Fixed-height row ensures UPPER SIX / LOWER SIX swap doesn't shift layout */
.vsaiLabelSixRow {
  display: flex;
  height: clamp(18px, 1.9vw, 36px);
  align-items: flex-start;
}
.vsaiLabelSix {
  display: block;
  height: clamp(18px, 1.9vw, 36px);
  width: auto;
  image-rendering: -webkit-optimize-contrast;
}
.vsaiProgress { margin-top: 0.6vw; width: 18vw; pointer-events: none; }
.vsaiProgressTrack {
  height: 2px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px; overflow: hidden; margin-bottom: 5px;
}
.vsaiProgressFill {
  height: 100%;
  background: linear-gradient(90deg, #00C97B 0%, #1E90FF 50%, #FF47A3 100%);
  border-radius: 4px;
  transition: width .8s cubic-bezier(.22,1,.36,1);
}
.vsaiProgressText {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.5vw; letter-spacing: 3px;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
}
/* Controls re-enabled pointer events when inside label */
.vsaiLabel .vsaiControls { pointer-events: auto; }

/* ── Champion badge (inside vsaiLabel, above title) ─────────── */
.vsaiChamp {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.4vw;
  margin-bottom: 0.3vw;
}
.vsaiChampCrown {
  font-size: clamp(10px, 0.9vw, 15px);
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(255, 200, 60, 0.6));
}
.vsaiChamp .vsaiChampTitle {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(7px, 0.55vw, 11px);
  font-weight: 700;
  letter-spacing: 3px;
  background: linear-gradient(90deg, #ff821e, #b446ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-transform: uppercase;
}
.vsaiChamp .vsaiChampSub { display: none; }

/* ═══════════════════════════════════════════════════════════════════
   PENTwelve — PRE-FIGHT CHALLENGE OVERLAY (Accept / Decline)
═══════════════════════════════════════════════════════════════════ */

.fcFightOverlay {
  position: fixed; inset: 0; z-index: 90;
  display: flex; align-items: center; justify-content: center;
  --ch-color: #fff;
}
.fcFightBg {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(18px);
}
.fcFightScanlines {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 4px);
  pointer-events: none;
}
.fcFightParticles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.fcFightParticle {
  position: absolute;
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--ch-color);
  opacity: 0;
  left: calc(var(--i) * 8%);
  bottom: -4px;
  animation: fcFightParticleRise calc(2.5s + var(--i) * 0.3s) calc(var(--i) * 0.15s) ease-in infinite;
}
@keyframes fcFightParticleRise {
  0%   { opacity: 0; transform: translateY(0); }
  15%  { opacity: 0.6; }
  100% { opacity: 0; transform: translateY(-80vh); }
}
.fcFightColorFlood {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 40% at 50% 100%, color-mix(in srgb, var(--ch-color) 10%, transparent), transparent 70%);
  pointer-events: none;
}
/* Tier color accents */
.fcTierOverlay0 { --ch-color: #00C97B; }
.fcTierOverlay1 { --ch-color: #8A6BFF; }
.fcTierOverlay2 { --ch-color: #FF4D6D; }
.fcTierOverlay3 { --ch-color: #F5A623; }
.fcTierOverlay4 { --ch-color: #C8C8C8; }

.fcFightCard {
  position: relative;
  z-index: 2;
  background: #0a0c16;
  border: 1px solid rgba(255,255,255,0.08);
  border-top: 3px solid var(--ch-color);
  border-radius: 8px;
  width: clamp(300px, 36vw, 520px);
  padding: 20px 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: 0 0 60px rgba(0,0,0,0.6), 0 0 80px color-mix(in srgb, var(--ch-color) 10%, transparent);
  animation: fcFightCardIn .35s cubic-bezier(.22,1,.36,1) both;
}
@keyframes fcFightCardIn {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.fcFightRankRow {
  display: flex; align-items: center; gap: 10px;
  align-self: stretch;
}
.fcFightRankLabel {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px; font-weight: 700; letter-spacing: 3px;
  color: rgba(255,255,255,0.3); text-transform: uppercase;
}
.fcFightRankNum {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px; font-weight: 900; letter-spacing: 2px;
  color: var(--ch-color); text-transform: uppercase;
}
.fcFightPortrait {
  position: relative;
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  margin: 0;
}
.fcFightPortraitRing {
  position: absolute; inset: 0;
  border-radius: 50%;
  border: 2px solid var(--ch-color);
  opacity: 0.4;
  animation: fcFightRingPulse 2s ease-in-out infinite;
}
@keyframes fcFightRingPulse {
  0%,100% { transform: scale(1); opacity: 0.4; }
  50%      { transform: scale(1.08); opacity: 0.7; }
}
.fcFightPortraitGlow {
  position: absolute; inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--ch-color) 25%, transparent), transparent 70%);
}
.fcFightPortraitEmoji { font-size: 36px; position: relative; }
.fcFightName {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(32px, 4vw, 52px); font-weight: 900; letter-spacing: 6px;
  color: #fff; text-transform: uppercase; text-align: center; line-height: 1;
}
.fcFightPersonality {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px; font-weight: 600; letter-spacing: 2px;
  color: var(--ch-color); text-transform: uppercase; text-align: center; opacity: 0.8;
}
.fcFightCharTitle {
  font-family: 'Orbitron', sans-serif;
  font-size: 8px; font-weight: 600; letter-spacing: 2px;
  color: var(--ch-color); text-transform: uppercase; text-align: center; opacity: 0.85;
}
.fcFightBadges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.fcModeBadge, .fcDiffBadge {
  font-family: 'Orbitron', sans-serif;
  font-size: 8px; font-weight: 700; letter-spacing: 1.5px;
  padding: 4px 8px; border-radius: 3px; text-transform: uppercase;
}
.fcModeBadge { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.55); }
.fcModenormal    { }
.fcModeblind_draft { background: rgba(155,93,229,0.15); border-color: rgba(155,93,229,0.3); color: #c48aff; }
.fcModemirror_war  { background: rgba(0,140,255,0.12); border-color: rgba(0,140,255,0.3); color: #4db8ff; }
.fcDiffBadge { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); color: rgba(255,255,255,0.5); }
.fcDiffeasy     { background: rgba(0,201,123,0.12); border-color: rgba(0,201,123,0.3); color: #00C97B; }
.fcDiffnormal      { background: rgba(0,120,255,0.12); border-color: rgba(0,120,255,0.3); color: #4d9dff; }
.fcDiffhard  { background: rgba(155,93,229,0.15); border-color: rgba(155,93,229,0.3); color: #c48aff; }
.fcDiffmaster{ background: rgba(245,166,35,0.12); border-color: rgba(245,166,35,0.3); color: #f5a623; }
.fcDiffexpert  { background: rgba(200,200,200,0.08); border-color: rgba(200,200,200,0.2); color: #d0d0d0; }
.fcFightDivider {
  align-self: stretch; height: 1px;
  background: rgba(255,255,255,0.06); margin: 2px 0;
}
.fcFightDialogue {
  align-self: stretch;
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.03);
  border-left: 2px solid var(--ch-color);
  border-radius: 2px;
}
.fcFightLine {
  font-family: 'Orbitron', 'Rajdhani', sans-serif;
  font-size: 14px; font-weight: 500; letter-spacing: 0.3px;
  color: rgba(255,255,255,0.6); line-height: 1.5;
  text-align: center;
  opacity: 0;
  animation: fcFightLineIn .4s ease both;
}
@keyframes fcFightLineIn {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
}
.fcFightActions {
  align-self: stretch;
  display: flex; gap: 10px; margin-top: 4px;
}
.fcFightDeclineBtn {
  flex: 1;
  background: #1a1c28;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 5px;
  color: rgba(255,255,255,0.5);
  font-family: 'Orbitron', sans-serif;
  font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
  padding: 10px 0; cursor: pointer;
  transition: background .12s, color .12s;
}
.fcFightDeclineBtn:hover { background: #252840; color: rgba(255,255,255,0.75); }
.fcFightBeginBtn {
  flex: 2;
  background: var(--ch-color);
  border: none; border-radius: 5px;
  color: #000;
  font-family: 'Orbitron', sans-serif;
  font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;
  padding: 10px 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: filter .12s, transform .1s;
}
.fcFightBeginBtn:hover { filter: brightness(1.12); transform: translateX(2px); }
.fcFightBeginArrow { font-size: 12px; }

/* Transition */
.fcFightFade-enter-active, .fcFightFade-leave-active { transition: opacity .25s ease; }
.fcFightFade-enter-from, .fcFightFade-leave-to { opacity: 0; }

/* ═══════════════════════════════════════════════════════════════════
   PENTwelve — POST-FIGHT RESULT OVERLAY
   WIN: rank-up cinematic with opponent color + next preview
   LOSE: rank-wall blocked state
═══════════════════════════════════════════════════════════════════ */

.fcResultOverlay {
  position: fixed; inset: 0; z-index: 80;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  --res-color: #C0C0C0;
}

/* Shared blurred backdrop */
.fcResultBg {
  position: absolute; inset: 0;
  background: rgba(3,3,14,.93);
  backdrop-filter: blur(22px);
}

/* Win: subtle color wash from bottom */
.fcResultOverlayWin .fcResultBg {
  background:
    radial-gradient(ellipse 100% 45% at 50% 100%, color-mix(in srgb, var(--res-color) 14%, transparent), transparent 70%),
    rgba(3,3,14,.93);
}

/* Lose: red danger tint */
.fcResultOverlayLose .fcResultBg {
  background:
    radial-gradient(ellipse 80% 40% at 50% 0%, rgba(200,20,20,.1), transparent 65%),
    rgba(3,3,14,.95);
}

/* Floating particles (win only) */
.fcResultParticles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.fcResultParticle {
  position: absolute;
  width: calc(2px + (var(--i) * 0.6px));
  height: calc(2px + (var(--i) * 0.6px));
  border-radius: 50%;
  background: var(--res-color);
  opacity: 0;
  left: calc(var(--i) * 6.25%);
  bottom: -6px;
  animation: fcResParticleRise calc(2.8s + var(--i) * 0.35s) calc(var(--i) * 0.2s) ease-in infinite;
  filter: blur(0.5px);
}
@keyframes fcResParticleRise {
  0%   { opacity: 0;   transform: translateY(0) scale(1); }
  12%  { opacity: 0.7; }
  85%  { opacity: 0.1; }
  100% { opacity: 0;   transform: translateY(-100vh) scale(0.3); }
}

/* ── Shared card shell ───────────────────────────────────────── */
.fcResultCard {
  position: relative; z-index: 2;
  width: min(440px, 100%);
  border-radius: 20px;
  background: rgba(8,8,20,.9);
  border: 1px solid rgba(255,255,255,.08);
  padding: 0;
  text-align: center;
  overflow: hidden;
  animation: fcResCardIn .45s cubic-bezier(.22,1,.36,1) both;
  box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 32px 80px rgba(0,0,0,.6);
}
@keyframes fcResCardIn {
  from { transform: translateY(28px) scale(.96); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}

/* ══════════════════════════════════════════════════════════════
   WIN STATE
══════════════════════════════════════════════════════════════ */

/* Top color stripe */
.fcResultWin::before {
  content: '';
  display: block; width: 100%; height: 4px;
  background: linear-gradient(90deg, transparent, var(--res-color), transparent);
}

/* "ELIMINATED" header block */
.fcResultElimLabel {
  font-size: 9px; letter-spacing: 5px; font-weight: 900;
  color: rgba(255,255,255,.3);
  padding: 18px 24px 4px;
}
.fcResultElimName {
  font-size: 30px; font-weight: 900; letter-spacing: 7px;
  text-shadow: 0 0 30px color-mix(in srgb, var(--res-color) 50%, transparent);
  padding: 0 24px 0;
  animation: fcElimNameIn .4s .1s cubic-bezier(.22,1,.36,1) both;
}
@keyframes fcElimNameIn {
  from { opacity: 0; transform: scale(1.1); filter: blur(3px); }
  to   { opacity: 1; transform: scale(1); filter: blur(0); }
}
.fcResultElimLine {
  height: 1px; margin: 14px 24px;
  opacity: .35; border-radius: 99px;
  animation: fcElimLineIn .5s .2s ease-out both;
}
@keyframes fcElimLineIn {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}

/* Rank climb counter */
.fcResultRankClimb {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  padding: 4px 24px 16px;
  animation: fcResSlideUp .4s .25s ease-out both;
}
@keyframes fcResSlideUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fcResultRankBefore {
  font-size: 22px; font-weight: 900; letter-spacing: 2px;
  color: rgba(255,255,255,.2);
  text-decoration: line-through;
}
.fcResultRankArrow {
  font-size: 20px; color: rgba(255,255,255,.25);
  animation: fcArrowPulse 1.4s .6s ease-in-out infinite;
}
@keyframes fcArrowPulse {
  0%,100% { opacity: .25; transform: translateX(0); }
  50%     { opacity: .8;  transform: translateX(3px); }
}
.fcResultRankAfter {
  font-size: 34px; font-weight: 900; letter-spacing: 2px;
  text-shadow: 0 0 24px currentColor;
  animation: fcRankAfterPop .5s .35s cubic-bezier(.22,1,.36,1) both;
}
@keyframes fcRankAfterPop {
  from { opacity: 0; transform: scale(1.5); filter: blur(4px); }
  to   { opacity: 1; transform: scale(1); filter: blur(0); }
}

/* Quote block */
.fcResultQuote {
  font-size: 12.5px; font-style: italic; line-height: 1.55;
  color: rgba(255,255,255,.6);
  margin: 0 24px 16px;
  padding: 12px 16px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 12px;
  animation: fcResSlideUp .4s .35s ease-out both;
}
.fcResultQuoteMark { opacity: .35; font-style: normal; font-size: 16px; }
.fcResultQuoteLose { margin: 0 24px 20px; }

/* Next opponent preview card */
.fcResultNext {
  margin: 0 24px 16px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--next-color, #fff) 30%, transparent);
  background: color-mix(in srgb, var(--next-color, #fff) 7%, rgba(8,8,20,.8));
  overflow: hidden;
  animation: fcResSlideUp .4s .45s ease-out both;
}
.fcResultNextHeader {
  font-size: 8px; letter-spacing: 4px; font-weight: 900;
  color: rgba(255,255,255,.3);
  padding: 10px 16px 4px;
  border-bottom: 1px solid rgba(255,255,255,.05);
}
.fcResultNextBody {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
}
.fcResultNextEmoji { font-size: 28px; flex-shrink: 0; }
.fcResultNextInfo { flex: 1; text-align: left; }
.fcResultNextName {
  font-size: 17px; font-weight: 900; letter-spacing: 3px;
  color: var(--next-color, #fff);
}
.fcResultNextSub { font-size: 10px; opacity: .4; margin-top: 2px; letter-spacing: 1px; }
.fcResultNextRank {
  font-size: 22px; font-weight: 900; letter-spacing: 1px;
  color: var(--next-color, #fff); opacity: .5;
  flex-shrink: 0;
}

/* Champion state */
.fcResultChampion {
  margin: 0 24px 16px; padding: 20px 16px;
  background: linear-gradient(135deg, rgba(255,200,0,.08), rgba(255,100,0,.06));
  border: 1px solid rgba(255,200,0,.2);
  border-radius: 14px;
  animation: fcResSlideUp .4s .45s ease-out both;
}
.fcResultChampionIcon { font-size: 36px; }
.fcResultChampionText {
  font-size: 18px; font-weight: 900; letter-spacing: 4px; margin-top: 8px;
  background: linear-gradient(90deg, #ffd700, #ff8c28);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.fcResultChampionSub { font-size: 11px; opacity: .4; margin-top: 6px; letter-spacing: 1px; }

/* Actions */
.fcResultActions {
  display: flex; flex-direction: column; gap: 8px;
  padding: 0 24px 22px;
  animation: fcResSlideUp .4s .55s ease-out both;
}
.fcResultBtn {
  width: 100%; padding: 13px; border-radius: 12px;
  font-size: 12px; font-weight: 900; letter-spacing: 2.5px;
  cursor: pointer; transition: transform .12s, box-shadow .15s, background .15s;
}
.fcResultBtn:hover { transform: scale(1.02); }
.fcResultBtn:active { transform: scale(.98); }

/* Next opponent button — uses next character's color */
.fcResultBtnNext {
  background: color-mix(in srgb, var(--next-color, #4fc3f7) 18%, rgba(8,8,20,.7));
  border: 1px solid color-mix(in srgb, var(--next-color, #4fc3f7) 45%, transparent);
  color: var(--next-color, #4fc3f7);
}
.fcResultBtnNext:hover {
  background: color-mix(in srgb, var(--next-color, #4fc3f7) 28%, rgba(8,8,20,.7));
  box-shadow: 0 0 24px color-mix(in srgb, var(--next-color, #4fc3f7) 25%, transparent);
}

.fcResultBtnChamp {
  background: linear-gradient(135deg, rgba(255,200,0,.18), rgba(255,100,0,.14));
  border: 1px solid rgba(255,200,0,.4); color: #ffd700;
}
.fcResultBtnChamp:hover { box-shadow: 0 0 24px rgba(255,200,0,.2); }

/* Retry button — uses defeated character's color */
.fcResultBtnRetry {
  background: color-mix(in srgb, var(--res-color, #ff4444) 14%, rgba(8,8,20,.8));
  border: 1px solid color-mix(in srgb, var(--res-color, #ff4444) 40%, transparent);
  color: var(--res-color, #ff8080);
}
.fcResultBtnRetry:hover {
  background: color-mix(in srgb, var(--res-color, #ff4444) 22%, rgba(8,8,20,.8));
  box-shadow: 0 0 20px color-mix(in srgb, var(--res-color, #ff4444) 20%, transparent);
}

.fcResultBtnSoft {
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
  color: rgba(255,255,255,.35);
}
.fcResultBtnSoft:hover { background: rgba(255,255,255,.06); }

/* ══════════════════════════════════════════════════════════════
   LOSE STATE — rank wall blocked
══════════════════════════════════════════════════════════════ */

/* Red top stripe on lose */
.fcResultLose::before {
  content: '';
  display: block; width: 100%; height: 4px;
  background: linear-gradient(90deg, transparent, var(--res-color, #ff3333), transparent);
}

.fcResultLoseHeader { padding: 18px 24px 14px; }
.fcResultLoseLabel {
  font-size: 9px; letter-spacing: 5px; font-weight: 900;
  color: rgba(255,80,50,.6); margin-bottom: 6px;
}
.fcResultLoseName {
  font-size: 28px; font-weight: 900; letter-spacing: 6px;
  text-shadow: 0 0 20px color-mix(in srgb, var(--res-color) 40%, transparent);
}

/* The rank wall */
.fcResultRankWall {
  margin: 0 24px 16px; padding: 20px 16px;
  background: color-mix(in srgb, var(--res-color) 6%, rgba(4,4,14,.8));
  border: 1px solid color-mix(in srgb, var(--res-color) 25%, transparent);
  border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.fcResultRankWallNum {
  font-size: 52px; font-weight: 900; letter-spacing: 2px; line-height: 1;
  text-shadow: 0 0 40px currentColor;
  animation: fcWallPulse 2.2s ease-in-out infinite;
}
@keyframes fcWallPulse {
  0%,100% { opacity: 1; }
  50%     { opacity: .7; }
}
.fcResultRankWallLabel {
  font-size: 9px; letter-spacing: 5px; font-weight: 900;
  color: rgba(255,80,50,.5);
}

/* ============================================================
   UNLOCK ANIMATION OVERLAY
   ============================================================ */
.unlockFade-enter-active{ animation: unlockFadeIn .3s ease-out; }
.unlockFade-leave-active{ animation: unlockFadeIn .22s ease-in reverse; }
@keyframes unlockFadeIn{
  from{ opacity: 0; }
  to{ opacity: 1; }
}

.unlockOverlay{
  position: fixed; inset: 0; z-index: 70;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.unlockBurst{
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 60% at 50% 50%,
    rgba(255,220,60,0.18), transparent 70%);
  animation: unlockPulse 1.2s ease-in-out infinite alternate;
  pointer-events: none;
}
@keyframes unlockPulse{
  from{ opacity: .6; transform: scale(0.95); }
  to{ opacity: 1; transform: scale(1.05); }
}

.unlockCard{
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 40px 28px;
  border-radius: 28px;
  border: 1px solid rgba(255,220,60,0.3);
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,220,60,0.12), transparent 70%),
    linear-gradient(180deg, rgba(22,18,8,0.97), rgba(10,8,4,0.97));
  box-shadow:
    0 0 80px rgba(255,200,40,0.22),
    0 30px 80px rgba(0,0,0,0.7),
    0 0 0 1px rgba(255,200,40,0.12) inset;
  animation: unlockCardIn .5s cubic-bezier(.22,1,.36,1);
  text-align: center;
  max-width: 340px;
  width: 100%;
}
@keyframes unlockCardIn{
  from{ transform: scale(0.7) translateY(40px); opacity: 0; }
  to{ transform: scale(1) translateY(0); opacity: 1; }
}

/* Per-tier unlock card colors */
.unlockTier1{ --u: 80,170,255; border-color: rgba(80,170,255,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(80,170,255,0.14), transparent 70%), linear-gradient(180deg, rgba(8,14,28,0.97), rgba(4,8,16,0.97)); box-shadow: 0 0 80px rgba(80,170,255,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.unlockTier2{ --u: 160,80,255; border-color: rgba(160,80,255,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(160,80,255,0.14), transparent 70%), linear-gradient(180deg, rgba(14,8,28,0.97), rgba(8,4,16,0.97)); box-shadow: 0 0 80px rgba(160,80,255,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.unlockTier3{ --u: 255,140,40; border-color: rgba(255,140,40,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,140,40,0.14), transparent 70%), linear-gradient(180deg, rgba(28,16,4,0.97), rgba(16,8,4,0.97)); box-shadow: 0 0 80px rgba(255,140,40,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.unlockTier4{ --u: 255,40,80; border-color: rgba(255,40,80,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,40,80,0.14), transparent 70%), linear-gradient(180deg, rgba(28,4,8,0.97), rgba(16,4,8,0.97)); box-shadow: 0 0 80px rgba(255,40,80,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.unlockTier5{ --u: 220,220,255; border-color: rgba(220,220,255,0.5); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(220,220,255,0.18), transparent 70%), linear-gradient(180deg, rgba(12,12,20,0.98), rgba(6,6,12,0.98)); box-shadow: 0 0 100px rgba(220,220,255,0.35), 0 30px 80px rgba(0,0,0,0.8); }

.unlockGlowRing{
  position: absolute;
  top: -30px; left: 50%; transform: translateX(-50%);
  width: 120px; height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, rgba(255,200,40,0.22), transparent 70%);
  filter: blur(18px);
  animation: unlockPulse 1.2s ease-in-out infinite alternate;
  pointer-events: none;
}
.unlockTier1 .unlockGlowRing{ background: radial-gradient(circle at 50% 50%, rgba(80,170,255,0.22), transparent 70%); }
.unlockTier2 .unlockGlowRing{ background: radial-gradient(circle at 50% 50%, rgba(160,80,255,0.22), transparent 70%); }
.unlockTier3 .unlockGlowRing{ background: radial-gradient(circle at 50% 50%, rgba(255,140,40,0.22), transparent 70%); }
.unlockTier4 .unlockGlowRing{ background: radial-gradient(circle at 50% 50%, rgba(255,40,80,0.22), transparent 70%); }
.unlockTier5 .unlockGlowRing{ background: radial-gradient(circle at 50% 50%, rgba(220,220,255,0.28), transparent 70%); }

.unlockEmoji{
  font-size: 52px;
  animation: unlockBounce .6s cubic-bezier(.22,1,.36,1) .15s both;
  position: relative;
  z-index: 1;
}
@keyframes unlockBounce{
  from{ transform: scale(0.4) rotate(-20deg); opacity: 0; }
  to{ transform: scale(1) rotate(0deg); opacity: 1; }
}
.unlockLabel{
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: .5;
  animation: unlockFadeUp .4s ease-out .25s both;
}
.unlockRankName{
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
  animation: unlockFadeUp .4s ease-out .35s both;
  background: linear-gradient(90deg, rgba(255,220,60,1), rgba(255,160,40,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.unlockTier1 .unlockRankName{ background: linear-gradient(90deg, rgba(80,170,255,1), rgba(140,220,255,1)); -webkit-background-clip: text; background-clip: text; }
.unlockTier2 .unlockRankName{ background: linear-gradient(90deg, rgba(160,80,255,1), rgba(210,140,255,1)); -webkit-background-clip: text; background-clip: text; }
.unlockTier3 .unlockRankName{ background: linear-gradient(90deg, rgba(255,140,40,1), rgba(255,200,80,1)); -webkit-background-clip: text; background-clip: text; }
.unlockTier4 .unlockRankName{ background: linear-gradient(90deg, rgba(255,40,80,1), rgba(255,120,80,1)); -webkit-background-clip: text; background-clip: text; }
.unlockTier5 .unlockRankName{ background: linear-gradient(90deg, rgba(200,200,255,1), rgba(255,255,255,1)); -webkit-background-clip: text; background-clip: text; }
.unlockRankDesc{
  font-size: 13px;
  opacity: .55;
  letter-spacing: 1px;
  animation: unlockFadeUp .4s ease-out .42s both;
}
.challengeCard{
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 40px 28px;
  border-radius: 28px;
  border: 1px solid rgba(255,80,80,0.35);
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,60,60,0.14), transparent 70%),
    linear-gradient(180deg, rgba(24,6,6,0.97), rgba(12,4,4,0.97));
  box-shadow:
    0 0 80px rgba(255,40,60,0.28),
    0 30px 80px rgba(0,0,0,0.7),
    0 0 0 1px rgba(255,60,60,0.14) inset;
  animation: unlockCardIn .45s cubic-bezier(.22,1,.36,1);
  text-align: center;
  max-width: 340px;
  width: 100%;
}
.challengeCard.unlockTier0{ border-color: rgba(80,255,120,0.35); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(80,255,120,0.12), transparent 70%), linear-gradient(180deg, rgba(4,18,8,0.97), rgba(2,10,4,0.97)); box-shadow: 0 0 80px rgba(80,255,120,0.22), 0 30px 80px rgba(0,0,0,0.7); }
.challengeCard.unlockTier0 .unlockRankName{ background: linear-gradient(90deg, rgba(80,255,120,1), rgba(140,255,180,1)); -webkit-background-clip: text; background-clip: text; }
.challengeCard.unlockTier1{ border-color: rgba(80,170,255,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(80,170,255,0.14), transparent 70%), linear-gradient(180deg, rgba(8,14,28,0.97), rgba(4,8,16,0.97)); box-shadow: 0 0 80px rgba(80,170,255,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.challengeCard.unlockTier2{ border-color: rgba(160,80,255,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(160,80,255,0.14), transparent 70%), linear-gradient(180deg, rgba(14,8,28,0.97), rgba(8,4,16,0.97)); box-shadow: 0 0 80px rgba(160,80,255,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.challengeCard.unlockTier3{ border-color: rgba(255,140,40,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,140,40,0.14), transparent 70%), linear-gradient(180deg, rgba(28,16,4,0.97), rgba(16,8,4,0.97)); box-shadow: 0 0 80px rgba(255,140,40,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.challengeCard.unlockTier4{ border-color: rgba(255,40,80,0.4); background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,40,80,0.14), transparent 70%), linear-gradient(180deg, rgba(28,4,8,0.97), rgba(16,4,8,0.97)); box-shadow: 0 0 80px rgba(255,40,80,0.24), 0 30px 80px rgba(0,0,0,0.7); }
.challengeSwords{
  font-size: 52px;
  animation: unlockBounce .55s cubic-bezier(.22,1,.36,1) .1s both;
  position: relative;
  z-index: 1;
}
.challengeLabel{
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: .5;
  animation: unlockFadeUp .4s ease-out .2s both;
}
.unlockActions{
  display: flex;
  gap: 8px;
  margin-top: 20px;
  width: 100%;
  animation: unlockFadeUp .4s ease-out .55s both;
  flex-wrap: wrap;
  justify-content: center;
}
.unlockBtn{
  flex: 1;
  min-width: 90px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.82);
  transition: background 140ms, border-color 140ms, transform 100ms;
  white-space: nowrap;
}
.unlockBtn:hover{ background: rgba(255,255,255,0.13); transform: translateY(-1px); }
.unlockBtn:active{ transform: translateY(0); }
.unlockBtnSoft{ color: rgba(255,255,255,0.55); }
.unlockBtnSecondary{
  border-color: rgba(var(--u, 255,220,60),0.35);
  color: rgba(var(--u, 255,220,60),0.9);
}
.unlockBtnPrimary{
  background: linear-gradient(135deg, rgba(var(--u, 255,220,60),0.28), rgba(var(--u, 255,220,60),0.14));
  border-color: rgba(var(--u, 255,220,60),0.55);
  color: rgba(var(--u, 255,220,60),1);
  box-shadow: 0 0 16px rgba(var(--u, 255,220,60),0.18);
}
.unlockBtnPrimary:hover{ background: linear-gradient(135deg, rgba(var(--u, 255,220,60),0.38), rgba(var(--u, 255,220,60),0.22)); }
.unlockTapBegin{
  font-size: 11px;
  letter-spacing: 2px;
  opacity: .3;
  margin-top: 12px;
  text-transform: uppercase;
  animation: unlockFadeUp .4s ease-out .55s both, unlockTapPulse 2s ease-in-out 1s infinite alternate;
}
@keyframes unlockTapPulse{
  from{ opacity: .2; }
  to{ opacity: .5; }
}
@keyframes unlockFadeUp{
  from{ transform: translateY(12px); opacity: 0; }
  to{ transform: translateY(0); opacity: 1; }
}

/* ══ Legendary Conquered Overlay ══════════════════════════════════════════ */
.lcOverlay{
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(20px);
}

/* Three layered burst rings */
.lcBurst{
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
}
.lcBurst1{
  background: radial-gradient(ellipse 55% 55% at 50% 50%, rgba(255,200,40,0.18), transparent 65%);
  animation: lcPulse1 2s ease-in-out infinite alternate;
}
.lcBurst2{
  background: radial-gradient(ellipse 75% 40% at 50% 50%, rgba(255,80,200,0.10), transparent 60%);
  animation: lcPulse2 2.6s ease-in-out infinite alternate;
}
.lcBurst3{
  background: radial-gradient(ellipse 40% 70% at 50% 50%, rgba(80,160,255,0.10), transparent 60%);
  animation: lcPulse3 3.1s ease-in-out infinite alternate;
}
@keyframes lcPulse1{
  from{ opacity:.5; transform: scale(0.92); }
  to{   opacity:1;  transform: scale(1.08); }
}
@keyframes lcPulse2{
  from{ opacity:.4; transform: scale(1.05) rotate(-4deg); }
  to{   opacity:.9; transform: scale(0.95) rotate(4deg); }
}
@keyframes lcPulse3{
  from{ opacity:.3; transform: scale(0.96) rotate(6deg); }
  to{   opacity:.8; transform: scale(1.04) rotate(-6deg); }
}

/* Floating stars layer */
.lcStars{
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.lcStar{
  position: absolute;
  font-size: calc(8px + (var(--i) * 1.2px));
  left: calc((var(--i) * 5.5%) + 1%);
  bottom: -20px;
  opacity: 0;
  color: rgba(255, 220, 60, 0.7);
  animation: lcStarFloat calc(3s + (var(--i) * 0.25s)) ease-in calc(var(--i) * 0.18s) infinite;
  text-shadow: 0 0 8px rgba(255,200,40,0.8);
}
.lcStar:nth-child(even){ color: rgba(255,120,220,0.7); text-shadow: 0 0 8px rgba(255,80,200,0.8); }
.lcStar:nth-child(3n){ color: rgba(120,200,255,0.7); text-shadow: 0 0 8px rgba(80,160,255,0.8); }
@keyframes lcStarFloat{
  0%  { transform: translateY(0)   rotate(0deg);   opacity: 0; }
  10% { opacity: 0.9; }
  90% { opacity: 0.5; }
  100%{ transform: translateY(-100vh) rotate(calc(var(--i) * 20deg)); opacity: 0; }
}

/* The main card */
.lcCard{
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 44px 32px;
  border-radius: 32px;
  border: 1px solid rgba(255,200,40,0.5);
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,200,40,0.16), transparent 65%),
    radial-gradient(ellipse 60% 40% at 20% 100%, rgba(255,80,200,0.08), transparent 70%),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(80,160,255,0.08), transparent 70%),
    linear-gradient(180deg, rgba(26,20,6,0.98), rgba(10,8,4,0.98));
  box-shadow:
    0 0 0 1px rgba(255,200,40,0.22) inset,
    0 0 60px rgba(255,180,20,0.30),
    0 0 120px rgba(255,80,200,0.12),
    0 30px 80px rgba(0,0,0,0.8);
  animation: lcCardIn .55s cubic-bezier(.22,1,.36,1);
  text-align: center;
  max-width: 360px;
  width: 100%;
}
@keyframes lcCardIn{
  from{ transform: scale(0.65) translateY(50px); opacity: 0; }
  to{   transform: scale(1)    translateY(0);    opacity: 1; }
}

/* Rainbow shimmer border sweep */
.lcCard::before{
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 33px;
  background: conic-gradient(
    from 0deg,
    rgba(255,220,60,0.6),
    rgba(255,80,200,0.5),
    rgba(80,160,255,0.5),
    rgba(80,255,160,0.4),
    rgba(255,220,60,0.6)
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  padding: 1px;
  animation: lcBorderSpin 4s linear infinite;
  pointer-events: none;
}
@keyframes lcBorderSpin{
  from{ filter: hue-rotate(0deg); }
  to{   filter: hue-rotate(360deg); }
}

.lcGlowRing{
  position: absolute;
  top: -40px; left: 50%; transform: translateX(-50%);
  width: 160px; height: 160px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, rgba(255,200,40,0.30), transparent 70%);
  filter: blur(22px);
  animation: lcPulse1 1.8s ease-in-out infinite alternate;
  pointer-events: none;
}

.lcCrown{
  font-size: 62px;
  animation: lcCrownIn .7s cubic-bezier(.22,1,.36,1) .1s both;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0 18px rgba(255,200,40,0.9));
}
@keyframes lcCrownIn{
  from{ transform: scale(0.3) translateY(-20px) rotate(-15deg); opacity: 0; }
  50% { transform: scale(1.15) translateY(4px) rotate(3deg); }
  to{   transform: scale(1) translateY(0) rotate(0deg); opacity: 1; }
}

.lcSuperLabel{
  font-size: 10px;
  letter-spacing: 4px;
  text-transform: uppercase;
  background: linear-gradient(90deg, rgba(255,200,40,0.9), rgba(255,120,200,0.9), rgba(100,180,255,0.9));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: lcFadeUp .4s ease-out .3s both;
  animation: lcBorderSpin 3s linear infinite, lcFadeUp .4s ease-out .3s both;
}

.lcTitle{
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 2px;
  line-height: 1.1;
  text-transform: uppercase;
  background: linear-gradient(135deg,
    rgba(255,230,80,1)  0%,
    rgba(255,160,40,1)  35%,
    rgba(255,80,180,1)  65%,
    rgba(120,180,255,1) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: lcFadeUp .45s ease-out .4s both;
  filter: drop-shadow(0 2px 12px rgba(255,180,40,0.4));
}

.lcDivider{
  width: 60px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, rgba(255,200,40,0.7), rgba(255,80,200,0.7), transparent);
  animation: lcFadeUp .4s ease-out .52s both;
  margin: 4px 0;
}

.lcQuote{
  font-size: 12px;
  line-height: 1.6;
  opacity: .55;
  letter-spacing: .5px;
  font-style: italic;
  animation: lcFadeUp .4s ease-out .58s both;
}

.lcBtnPlayAgain{
  --u: 255,200,40;
  background: linear-gradient(135deg, rgba(255,200,40,0.28), rgba(255,120,60,0.18));
  border-color: rgba(255,200,40,0.6);
  color: rgba(255,220,80,1);
  box-shadow: 0 0 20px rgba(255,180,40,0.25);
}
.lcBtnPlayAgain:hover{
  background: linear-gradient(135deg, rgba(255,200,40,0.40), rgba(255,120,60,0.28));
  box-shadow: 0 0 28px rgba(255,180,40,0.40);
}

@keyframes lcFadeUp{
  from{ transform: translateY(14px); opacity: 0; }
  to{   transform: translateY(0);    opacity: 1; }
}

/* Fit-to-viewport in-game (no scroll): keep the whole layout within the main area */
.gameLayout{
  display:grid;
  grid-template-columns: 420px 1fr;
  gap: 14px;
  height: 100%;
  min-height: 0;
  align-items: stretch;
  position: relative;
  /* Always keep the desktop 2-panel side-by-side layout — never stack on mobile */
}

/* Mobile: keep side-by-side layout — viewport is forced to 1920px so this always fits */
@media (max-width: 1920px){
  .gameLayout{
    min-width: 900px;
  }
}

@media (max-width: 520px){
  .panelHead, .panel{ border-radius: 16px; }
}

.leftPanel,.rightPanel{ min-width:0; }
.leftPanel{ display:flex; flex-direction: column; gap: 12px; min-height: 0; }
.rightPanel{ display:flex; flex-direction: column; gap: 10px; min-height: 0; }
/* Fix 19 — adjacency hint for P2 first move */
.adjacencyHint{text-align:center;padding:7px 16px;border-radius:10px;background:rgba(0,0,0,.60);border:1px solid rgba(255,200,80,.30);color:rgba(255,220,120,.92);font-size:12px;font-weight:700;letter-spacing:.03em;pointer-events:none;animation:adjFadeIn .35s ease;}
@keyframes adjFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.panelHead{ padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.hudPanel{ padding: 14px; display: flex; flex-direction: column; gap: 10px; }

/* ── TURN BANNER ─────────────────────────────────────────────────── */
.turnBanner{
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  overflow: visible;
  transition: border-color .2s, box-shadow .2s;
}
.tbGlow{
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s;
  border-radius: 16px;
}
/* P1 = cyan */
/* Puzzle mode = teal/green neutral tone */
.turnBanner.tbPuzzle{
  border-color: rgba(61,255,160,0.25);
  box-shadow: 0 0 0 1px rgba(61,255,160,0.06) inset, 0 8px 32px rgba(0,0,0,0.40);
}
.turnBanner.tbPuzzle .tbGlow{
  background: radial-gradient(ellipse 140% 100% at 0% 50%, rgba(61,255,160,0.10), transparent 65%);
  opacity: 1;
}
.turnBanner.tbPuzzle .tbMain{ color: rgba(61,255,160,0.90); }
.turnBanner.tbP1{
  border-color: rgba(0,229,255,0.30);
  box-shadow: 0 0 0 1px rgba(0,229,255,0.08) inset, 0 8px 32px rgba(0,0,0,0.40);
}
.turnBanner.tbP1 .tbGlow{
  background: radial-gradient(ellipse 140% 100% at 0% 50%, rgba(0,229,255,0.13), transparent 65%);
  opacity: 1;
}
/* P2 = red */
.turnBanner.tbP2{
  border-color: rgba(255,64,96,0.30);
  box-shadow: 0 0 0 1px rgba(255,64,96,0.08) inset, 0 8px 32px rgba(0,0,0,0.40);
}
.turnBanner.tbP2 .tbGlow{
  background: radial-gradient(ellipse 140% 100% at 0% 50%, rgba(255,64,96,0.13), transparent 65%);
  opacity: 1;
}
/* YOUR turn: extra punch */
.turnBanner.tbYours{
  animation: tbYoursPulse 2s ease-in-out infinite;
}
@keyframes tbYoursPulse{
  0%,100%{ box-shadow: 0 0 0 1px rgba(0,229,255,0.08) inset, 0 8px 32px rgba(0,0,0,0.40), 0 0 14px rgba(0,229,255,0.08); }
  50%{ box-shadow: 0 0 0 1px rgba(0,229,255,0.16) inset, 0 8px 32px rgba(0,0,0,0.40), 0 0 28px rgba(0,229,255,0.16); }
}
.turnBanner.tbP2.tbYours{
  animation: tbYoursPulseP2 2s ease-in-out infinite;
}
@keyframes tbYoursPulseP2{
  0%,100%{ box-shadow: 0 0 0 1px rgba(255,64,96,0.08) inset, 0 8px 32px rgba(0,0,0,0.40), 0 0 14px rgba(255,64,96,0.08); }
  50%{ box-shadow: 0 0 0 1px rgba(255,64,96,0.16) inset, 0 8px 32px rgba(0,0,0,0.40), 0 0 28px rgba(255,64,96,0.16); }
}
.turnBanner.tbEnd{
  border-color: rgba(255,255,255,0.14);
  box-shadow: 0 8px 24px rgba(0,0,0,0.30);
}

.tbLeft{ flex: 1; min-width: 0; position: relative; z-index: 1; }
.tbPhaseTag{
  font-size: 10px;
  letter-spacing: 2.5px;
  font-weight: 900;
  opacity: .5;
  margin-bottom: 3px;
}
.tbMain{
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 1px;
  line-height: 1.1;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}
.turnBanner.tbP1 .tbMain{ color: rgba(0,229,255,0.95); }
.turnBanner.tbP2 .tbMain{ color: rgba(255,64,96,0.95); }
.turnBanner.tbEnd .tbMain{ color: rgba(255,255,255,0.7); font-size: 18px; }
.tbPlayerNum{
  font-size: 26px;
  font-weight: 900;
}
/* Human player name stays white regardless of P1/P2 color */
.tbHumanName {
  color: #ffffff !important;
  text-shadow: none;
}
/* AI name line (themed color) */
.tbNameLine {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.1;
}
.tbAiName {
  font-size: 26px;
  font-weight: 900;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  text-shadow: 0 0 14px currentColor;
  letter-spacing: 1px;
}
.tbActionLine {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: 0.65;
  margin-top: 2px;
}
.tbSub{
  font-size: 11px;
  opacity: .6;
  margin-top: 3px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.tbRight{ flex-shrink: 0; position: relative; z-index: 1; }
.tbDraftTimer{
  font-size: 22px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  padding: 6px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0,229,255,0.22);
  background: rgba(0,229,255,0.08);
  color: rgba(0,229,255,0.95);
}
.tbDraftTimer.tbDraftUrgent{
  border-color: rgba(255,64,96,0.45);
  background: rgba(255,64,96,0.12);
  color: rgba(255,64,96,0.95);
  animation: tbDraftUrgentBlink .7s ease-in-out infinite;
}
@keyframes tbDraftUrgentBlink{
  0%,100%{ box-shadow: none; }
  50%{ box-shadow: 0 0 20px rgba(255,64,96,0.22); }
}
.tbYourTurnBadge{
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0,229,255,0.35);
  background: rgba(0,229,255,0.12);
  color: rgba(0,229,255,0.95);
  animation: tbYourBadgePulse 1.4s ease-in-out infinite;
}
.turnBanner.tbP2 .tbYourTurnBadge{
  border-color: rgba(255,64,96,0.35);
  background: rgba(255,64,96,0.12);
  color: rgba(255,64,96,0.95);
}
@keyframes tbYourBadgePulse{
  0%,100%{ opacity: .8; }
  50%{ opacity: 1; }
}
.tbWaitBadge{
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  opacity: .55;
}

/* ── DUAL CLOCKS ──────────────────────────────────────────────────── */
.hudClocks{ margin-top: 0; }
.hudStat.activeClock{
  transform: scale(1.02);
  z-index: 1;
}
.hudStat.timer.p1.activeClock{
  border-color: rgba(0,229,255,.40);
  box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,229,255,0.18) inset, 0 0 18px rgba(0,229,255,0.10);
}
.hudStat.timer.p2.activeClock{
  border-color: rgba(255,64,96,.40);
  box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.18) inset, 0 0 18px rgba(255,64,96,0.10);
}

/* ── ONLINE META (ping + code) ───────────────────────────────────── */
.hudMeta{ margin-top: 0; }

/* ── HUD FOOTER ──────────────────────────────────────────────────── */
.hudFooter{
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.hudModeChip{
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  opacity: .5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hudYouInline{
  opacity: .7;
}
.hudLegend{
  display: flex;
  gap: 10px;
  align-items: center;
}
.hudLegendItem{
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.8px;
  opacity: .65;
  white-space: nowrap;
}
.hudSwatch{
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.16);
}
.hudSwatch.ok  { background: rgba(0,255,170,0.70); }
.hudSwatch.bad { background: rgba(255,80,120,0.70); }
.hudControlsHint{
  margin-left: auto;
  font-size: 11px;
  font-weight: 800;
  opacity: .45;
  white-space: nowrap;
}




.hudGrid{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
@media (max-width: 920px){ .hudGrid{ grid-template-columns: 1fr; } }


.statLabel{ font-size: 11px; opacity: .72; font-weight: 900; letter-spacing: 1.2px; white-space: nowrap; }
.statValue{ font-size: 14px; font-weight: 900; }
.hudStat{ display:flex; align-items:center; gap: 10px; padding: 10px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.18)); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.25) inset; transition: transform .15s, box-shadow .15s, border-color .15s; }
.hudStat.timer .statValue{ font-variant-numeric: tabular-nums; }

.pingDot{ width: 10px; height: 10px; border-radius: 999px; background: rgba(150,150,150,0.9); box-shadow: 0 0 12px rgba(255,255,255,0.10); }
.hudStat.ping.good{ border-color: rgba(0,255,128,0.22); }
.hudStat.ping.good .pingDot{ background: rgba(0,255,128,0.92); box-shadow: 0 0 14px rgba(0,255,128,0.18); }
.hudStat.ping.mid{ border-color: rgba(255,215,0,0.22); }
.hudStat.ping.mid .pingDot{ background: rgba(255,215,0,0.92); box-shadow: 0 0 14px rgba(255,215,0,0.16); }
.hudStat.ping.bad{ border-color: rgba(255,64,96,0.25); }
.hudStat.ping.bad .pingDot{ background: rgba(255,64,96,0.92); box-shadow: 0 0 14px rgba(255,64,96,0.18); }
.hudStat.ping.na .pingDot{ opacity: .55; }

.hudStat.ping{ padding: 8px 10px; }

/* CODE tile: single-line HUD row (prevents tall empty ping row) */
.hudStat.code{ padding: 8px 10px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
.hudStat.code .statLabel{ margin-right: 2px; }
.hudStat.code .statValue{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; letter-spacing: 0.6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.copyBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  color: #eaeaea;
  font-weight: 1000;
  font-size: 12px;
  letter-spacing: 0.8px;
  cursor: pointer;
  flex: 0 0 auto;
  white-space: nowrap;
  box-shadow:
    0 12px 28px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.06) inset;
  transition: transform .08s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, filter .18s ease;
}
.copyBtn:hover{
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.22);
  box-shadow:
    0 16px 36px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.07) inset;
  filter: brightness(1.03);
}
.copyBtn:active{ transform: translateY(0px) scale(0.99); }

.hudStat.timer{ gap: 10px; }
.clockBadge{ display:inline-flex; align-items:center; justify-content:center; padding: 4px 10px; border-radius: 999px; font-weight: 900; font-size: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); }
.clockBadge.p1{ border-color: rgba(0,229,255,.28); background: rgba(0,229,255,.10); }
.clockBadge.p2{ border-color: rgba(255,64,96,.28); background: rgba(255,64,96,.10); }
.clockValue{ font-size: 16px; letter-spacing: 0.3px; }
.hudStat.timer.p1{ border-color: rgba(0,229,255,.22); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,229,255,0.10) inset; }
.hudStat.timer.p2{ border-color: rgba(255,64,96,.22); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.10) inset; }

@keyframes timeUrgentBlink{
  0%, 100%{ border-color: rgba(255,64,96,.35); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.12) inset, 0 0 18px rgba(255,64,96,0.10); }
  50%{ border-color: rgba(255,64,96,.70); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.22) inset, 0 0 26px rgba(255,64,96,0.18); }
}
.hudStat.timer.urgent{ animation: timeUrgentBlink 0.85s ease-in-out infinite; }

.panel{ margin-top: 12px; padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.panelTitle{ margin: 0 0 10px 0; }

/* ── Puzzle Mode HUD ────────────────────────────────────────── */
.puzzleHud {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(61,255,160,0.15);
  border-radius: 12px;
  margin-bottom: 10px;
}
.puzzleHudHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.puzzleHudTitle {
  font-family: "Orbitron", sans-serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  color: rgba(61,255,160,0.80);
  text-transform: uppercase;
}
.puzzleHudStats {
  display: flex;
  align-items: center;
  gap: 0;
}
.puzzleHudDivider {
  width: 1px;
  height: 32px;
  background: rgba(255,255,255,0.10);
  margin: 0 12px;
}
.puzzleHudStat {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}
.puzzleHudLabel {
  font-family: "Orbitron", sans-serif;
  font-size: 7px;
  letter-spacing: 1.5px;
  font-weight: 900;
  color: rgba(255,255,255,0.30);
  text-transform: uppercase;
  margin-top: 2px;
}
.puzzleHudValue {
  font-family: "Orbitron", sans-serif;
  font-size: 22px;
  font-weight: 900;
  color: rgba(255,255,255,0.90);
  line-height: 1.1;
}
.puzzleHudOf {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.35);
}
.puzzleProgressBar {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  overflow: hidden;
}
.puzzleProgressFill {
  height: 100%;
  background: linear-gradient(90deg, #3dffa0, #00e5ff);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.puzzleFinishBtn {
  font-family: "Orbitron", sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(61,255,160,0.35);
  background: rgba(61,255,160,0.10);
  color: rgba(61,255,160,0.90);
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
  white-space: nowrap;
}
.puzzleFinishBtn:hover {
  background: rgba(61,255,160,0.20);
  border-color: rgba(61,255,160,0.60);
  color: #3dffa0;
}
.hintSmall{ margin-top: 10px; opacity:.75; font-size: 12px; }
.turnBadge{ padding: 8px 10px; border-radius: 999px; font-weight: 900; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); }
.turnBadge.p1{ border-color: rgba(0,229,255,.25); background: rgba(0,229,255,.10); }
.turnBadge.p2{ border-color: rgba(255,64,96,.25); background: rgba(255,64,96,.10); }
.turnBadge.end{ border-color: rgba(255,255,255,.18); }
.modeRow{ display:flex; justify-content:space-between; align-items:center; gap: 10px; flex-wrap: wrap; }
.statusTag,.keysTag{ margin-top: 10px; font-size: 12px; opacity: .85; font-weight: 700; }

/* Fit-to-viewport: avoid pushing Controls off-screen at 100% zoom */
@media (max-height: 820px){
  .gameLayout{ gap: 12px; }
  .leftPanel{ gap: 10px; }
  .panel{ margin-top: 10px; padding: 12px; }
  .panelHead{ padding: 13px; }
  .hudPanel{ padding: 12px; gap: 8px; }
  .tbMain{ font-size: 19px; }
  .tbPlayerNum{ font-size: 22px; }
}


/* =========================
   ARCADE-INSPIRED MENU (ONLY MENUS)
========================= */
.pbShell {
  /*
    AAA menu layout goal:
    - tiles feel larger than their pane
    - far right edge disappears off-screen (no visible "panel edge")
    - DO NOT crop vertical content (so lower items stay visible)

    The main scroll container (.main) has padding: 18px.
    We cancel ONLY the right padding here so the menu can reach the viewport edge.
  */
  width: min(1020px, calc(100vw - 18px));
  margin: 0 -18px 0 auto; /* cancel .main right padding so tiles can overhang to the edge */
  padding: 0 0 14px;
  /* Let the browser handle scrolling (prevents double scrollbars) */
/* topbar (~72px) + breathing room */
  display: flex;
  flex-direction: column;
}

/* Certain pages (e.g., Lobby) should be centered instead of right-aligned */
.pbShellCentered{
  width: min(1020px, calc(100vw - 36px));
  margin: 0 auto;
}

/* ═══════════════════════════════════════════════════
   NEW PROFILE PAGE  (chess.com-style)
═══════════════════════════════════════════════════ */
.pbNewProfile {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 0 60px;
  overflow-y: auto;
  max-height: calc(100vh - 72px);
}

/* Guest splash */
.pbNPGuestWrap {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 340px; gap: 14px; text-align: center; padding: 40px 24px;
}
.pbNPGuestTitle { font-size: 22px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; font-family: 'Orbitron', sans-serif; }
.pbNPGuestSub   { color: rgba(255,255,255,0.45); font-size: 13px; }
.pbNPGuestBtns  { display: flex; gap: 12px; margin-top: 8px; }

/* Banner */
.pbNPBanner {
  width: 100%; height: 120px; position: relative; overflow: hidden;
  background: linear-gradient(135deg, #1a0a2e 0%, #0d1a3a 40%, #0a2a1a 100%);
}
.pbNPBannerGrad {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(180,60,255,0.25) 0%, rgba(60,120,255,0.18) 50%, rgba(60,255,160,0.18) 100%);
}

/* Hero row */
.pbNPHero {
  display: flex; align-items: flex-end; gap: 20px;
  padding: 0 28px 0 28px;
  margin-top: -52px;
  position: relative; z-index: 2;
}
.pbNPAvatarWrap { position: relative; flex-shrink: 0; }
.pbNPAvatar {
  width: 100px; height: 100px; border-radius: 16px;
  border: 3px solid rgba(255,255,255,0.15);
  background: #1a1a2e;
  object-fit: cover;
}
.pbNPOnlineDot {
  position: absolute; bottom: 6px; right: 6px;
  width: 12px; height: 12px; border-radius: 50%;
  background: #4dff90; border: 2px solid #121218;
}
.pbNPHeroInfo {
  flex: 1; padding-bottom: 10px; padding-top: 52px;
  display: flex; flex-direction: column; gap: 4px;
}
.pbNPHeroName {
  font-family: 'Orbitron', sans-serif;
  font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #fff;
  display: flex; align-items: center; gap: 8px;
}
.pbNPHeroFlag { font-size: 18px; }
.pbNPHeroStatus { font-size: 12px; color: rgba(255,255,255,0.3); font-style: italic; }
.pbNPHeroMeta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 12px; color: rgba(255,255,255,0.45); margin-top: 2px;
}
.pbNPHeroMeta b { color: rgba(255,255,255,0.8); }
.pbNPMetaDot { opacity: 0.3; }
.pbNPOnlineNow { color: #4dff90; }
.pbNPHeroActions { padding-bottom: 14px; display: flex; gap: 10px; align-items: flex-end; }

/* Buttons */
.pbNPActionBtn {
  padding: 8px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.07); color: #fff; font-size: 12px; font-weight: 700;
  letter-spacing: 1px; text-transform: uppercase;
  font-family: 'Orbitron', system-ui, sans-serif; cursor: pointer;
  transition: background .13s, border-color .13s;
}
.pbNPActionBtn:hover { background: rgba(255,255,255,0.13); border-color: rgba(255,255,255,0.3); }
.pbNPActionPrimary { background: rgba(80,200,120,0.15); border-color: rgba(80,200,120,0.4); color: #5ce89a; }
.pbNPActionPrimary:hover { background: rgba(80,200,120,0.25); }
.pbNPActionEdit { font-size: 11px; }

/* Tab nav */
.pbNPTabNav {
  display: flex; gap: 0; padding: 0 28px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-top: 12px;
}
.pbNPTab {
  padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.45); font-size: 13px; font-weight: 600; cursor: pointer;
  letter-spacing: 0.3px; transition: color .13s, border-color .13s; margin-bottom: -1px;
}
.pbNPTab:hover { color: rgba(255,255,255,0.75); }
.pbNPTab.active { color: #fff; border-bottom-color: #5ce89a; }

/* Body: two-column layout */
.pbNPBody {
  display: flex; gap: 24px; padding: 24px 28px 0; align-items: flex-start;
}
.pbNPMain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.pbNPSidebar { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }

/* Rating cards row */
.pbNPRatingCards {
  display: flex; gap: 14px;
}
.pbNPRatingCard {
  flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 16px 14px; display: flex; align-items: flex-start; gap: 12px;
  transition: background .13s;
}
.pbNPRatingCard:hover { background: rgba(255,255,255,0.07); }
.pbNPRatingIcon { font-size: 24px; margin-top: 2px; }
.pbNPRatingInfo { flex: 1; min-width: 0; }
.pbNPRatingMode { font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
.pbNPRatingVal  { font-size: 28px; font-weight: 900; color: #fff; font-family: 'Orbitron', sans-serif; line-height: 1.1; }
.pbNPRatingBar  { height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.pbNPRatingBarFill { height: 100%; border-radius: 2px; background: #4da6ff; transition: width .4s; }

/* Section */
.pbNPSection { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; }
.pbNPSectionHead {
  padding: 14px 18px; font-size: 15px; font-weight: 700; color: #fff;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.pbNPSectionCount { color: rgba(255,255,255,0.35); font-weight: 400; font-size: 13px; margin-left: 4px; }
.pbNPLoading, .pbNPEmpty { padding: 32px; text-align: center; color: rgba(255,255,255,0.3); font-size: 13px; }

/* Table */
.pbNPTable { width: 100%; border-collapse: collapse; font-size: 12px; }
.pbNPTable thead tr { border-bottom: 1px solid rgba(255,255,255,0.07); }
.pbNPTable th { padding: 10px 14px; color: rgba(255,255,255,0.35); font-weight: 600; text-align: left; letter-spacing: 0.5px; font-size: 11px; text-transform: uppercase; }
.pbNPTableRow { border-bottom: 1px solid rgba(255,255,255,0.05); transition: background .1s; cursor: default; }
.pbNPTableRow:hover { background: rgba(255,255,255,0.04); }
.pbNPTableRow td { padding: 10px 14px; color: rgba(255,255,255,0.7); vertical-align: middle; }
.pbNPTableRow.npWin { border-left: 2px solid rgba(77,255,144,0.5); }
.pbNPTableRow.npLoss { border-left: 2px solid rgba(255,64,96,0.5); }
.pbNPTableRow.npDraw { border-left: 2px solid rgba(255,200,50,0.4); }
.pbNPTdPlayers { display: flex; align-items: center; gap: 6px; }
.pbNPPlayerMe  { color: #fff; font-weight: 700; }
.pbNPVs        { color: rgba(255,255,255,0.25); font-size: 10px; }
.pbNPTdMode    { color: rgba(255,255,255,0.4); font-size: 11px; letter-spacing: 0.5px; }
.pbNPTdDate    { color: rgba(255,255,255,0.35); font-size: 11px; }
.pbNPResultBadge {
  display: inline-block; padding: 2px 8px; border-radius: 5px;
  font-size: 10px; font-weight: 900; letter-spacing: 1.5px;
  font-family: 'Orbitron', system-ui, sans-serif;
}
.pbNPResultBadge.w { background: rgba(77,255,144,0.12); color: #4dff90; border: 1px solid rgba(77,255,144,0.25); }
.pbNPResultBadge.l { background: rgba(255,64,96,0.12);  color: #ff4060; border: 1px solid rgba(255,64,96,0.25);  }
.pbNPResultBadge.d { background: rgba(255,200,50,0.10); color: #ffd050; border: 1px solid rgba(255,200,50,0.2);  }

/* Pagination */
.pbNPPagination {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 12px; border-top: 1px solid rgba(255,255,255,0.06);
}
.pbNPPageBtn {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  color: #fff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  transition: background .12s;
}
.pbNPPageBtn:disabled { opacity: 0.3; cursor: default; }
.pbNPPageBtn:not(:disabled):hover { background: rgba(255,255,255,0.12); }
.pbNPPageInfo { font-size: 12px; color: rgba(255,255,255,0.4); }

/* Sidebar cards */
.pbNPSideCard {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 16px;
}
.pbNPSideCardTitle { font-size: 10px; font-weight: 900; letter-spacing: 2px; color: rgba(255,255,255,0.35); text-transform: uppercase; margin-bottom: 12px; font-family: 'Orbitron', sans-serif; }
.pbNPSideRankBadge {
  display: inline-block; padding: 5px 14px; border-radius: 8px;
  font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 900; letter-spacing: 1.5px;
  text-transform: uppercase; margin-bottom: 6px;
  background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.6);
}
.pbNPSideRankLp { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 6px; }
.pbNPSideRankRecord { display: flex; gap: 10px; font-size: 12px; margin-bottom: 8px; }
.pbNPRW { color: #4dff90; font-weight: 700; }
.pbNPRL { color: #ff4060; font-weight: 700; }
.pbNPRWr { color: rgba(255,255,255,0.4); }
.pbNPStreakBadge, .pbNPShieldBadge {
  display: inline-block; font-size: 11px; color: rgba(255,255,255,0.55);
  background: rgba(255,255,255,0.06); border-radius: 6px; padding: 3px 8px; margin-top: 4px;
}
.pbNPStatRow {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 12px; color: rgba(255,255,255,0.5);
}
.pbNPStatRow:last-child { border-bottom: none; }
.pbNPStatRow b { color: #fff; font-weight: 700; }

/* Stats tab grid */
.pbNPStatGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.05); }
.pbNPStatBlock { background: #141420; padding: 20px 14px; text-align: center; }
.pbNPStatBlockNum { font-size: 24px; font-weight: 900; color: #fff; font-family: 'Orbitron', sans-serif; }
.pbNPStatBlockLbl { font-size: 10px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }

/* Coming soon */
.pbNPComingSoon {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 80px 0; color: rgba(255,255,255,0.3);
}
.pbNPComingSoonIcon { font-size: 40px; }
.pbNPComingSoonText { font-size: 14px; font-weight: 600; letter-spacing: 1px; }

@media (max-width: 700px) {
  .pbNPHero { padding: 0 14px; gap: 12px; }
  .pbNPAvatar { width: 72px; height: 72px; }
  .pbNPHeroName { font-size: 16px; }
  .pbNPBody { flex-direction: column; padding: 16px 14px 0; }
  .pbNPSidebar { width: 100%; }
  .pbNPRatingCards { flex-direction: column; }
  .pbNPTabNav { padding: 0 14px; overflow-x: auto; }
  .pbNPStatGrid { grid-template-columns: repeat(2, 1fr); }
}

.pbHeaderRow{
  /* Page title is now handled by the top bar (Menu-style),
     so we hide the extra in-pane header to avoid duplicates. */
  display:none;
}

.pbPageTitle{
  font-weight: 1000;
  letter-spacing: 2px;
  font-size: clamp(28px, 5vh, 44px);
  opacity:.75;
  text-transform: uppercase;
  text-shadow: 0 2px 18px rgba(0,0,0,.55);
}

.pbPane{
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 14px;
  padding: 0;
  backdrop-filter: none;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pbHero{
  padding: 2px 6px clamp(8px, 1.6vh, 12px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 10px;
}
.pbHero.compact{
  padding-bottom: 12px;
}

.pbHeroTop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom: 8px;
}

.pbBadge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 1px;
  font-size: 12px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,0.10);
  text-transform: uppercase;
}
.pbBadge.green{
  border-color: rgba(80,255,160,0.25);
  box-shadow: 0 0 0 1px rgba(80,255,160,0.12) inset;
}

.pbIgn{
  display:flex;
  align-items:baseline;
  gap:10px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,0.10);
}
.pbIgnLabel{
  font-size: 11px;
  letter-spacing: 2px;
  opacity:.65;
}
.pbIgnName{
  font-weight: 1000;
  letter-spacing: 1px;
}

.pbHintRight{
  font-size: 12px;
  opacity: .75;
}

.pbHeroTitle{
  font-weight: 1000;
  letter-spacing: 4px;
  font-size: clamp(26px, 4.6vh, 40px);
  text-transform: uppercase;
}

/* WELCOME: big AAA-style title with logo mark */
.pbWelcomeTitle{
  display: inline-flex;
  align-items: center;
  gap: clamp(10px, 2vh, 18px);
  font-size: clamp(34px, 6.2vh, 64px);
  letter-spacing: clamp(2px, 0.5vh, 6px);
  text-shadow:
    0 18px 50px rgba(0,0,0,0.55),
    0 0 26px rgba(0,229,255,0.10),
    0 0 22px rgba(255,43,214,0.08);
}
.pbWelcomeLogo{
  width: clamp(44px, 7vh, 86px);
  height: clamp(44px, 7vh, 86px);
  object-fit: contain;
  filter:
    drop-shadow(0 14px 34px rgba(0,0,0,0.62))
    drop-shadow(0 0 22px rgba(0,229,255,0.18))
    drop-shadow(0 0 18px rgba(255,43,214,0.14));
}

.pbBrandPng{
  width: clamp(180px, 36vh, 520px);
  height: auto;
  object-fit: contain;
  max-width: min(92vw, 560px);
  filter:
    drop-shadow(0 18px 46px rgba(0,0,0,0.62))
    drop-shadow(0 0 26px rgba(0,229,255,0.20))
    drop-shadow(0 0 22px rgba(255,43,214,0.16));
}

/* Split brand (logo + title PNG) */
.pbBrandRow{
  display:flex;
  align-items:center;
  justify-content:center;
  gap: clamp(10px, 2.2vh, 18px);
  max-width: min(92vw, 720px);
}
.pbBrandLogo{
  width: clamp(44px, 7vh, 86px);
  height: clamp(44px, 7vh, 86px);
  object-fit: contain;
  filter:
    drop-shadow(0 14px 34px rgba(0,0,0,0.62))
    drop-shadow(0 0 22px rgba(0,229,255,0.18))
    drop-shadow(0 0 18px rgba(255,43,214,0.14));
}
.pbTitlePng{
  width: clamp(220px, 42vh, 620px);
  height: auto;
  object-fit: contain;
  max-width: min(78vw, 640px);
  filter:
    drop-shadow(0 18px 46px rgba(0,0,0,0.62))
    drop-shadow(0 0 26px rgba(0,229,255,0.20))
    drop-shadow(0 0 22px rgba(255,43,214,0.16));
}

/* Menu text PNG helpers (optional) */
.pbTextPng{
  display:block;
  height: 22px;
  width: auto;
  object-fit: contain;
  filter:
    drop-shadow(0 10px 28px rgba(0,0,0,0.55))
    drop-shadow(0 0 18px rgba(0,229,255,0.16))
    drop-shadow(0 0 14px rgba(255,43,214,0.12));
}
.pbSubPng{
  display:block;
  height: 14px;
  width: auto;
  object-fit: contain;
  opacity: .92;
  filter:
    drop-shadow(0 8px 22px rgba(0,0,0,0.5))
    drop-shadow(0 0 14px rgba(0,229,255,0.12));
}
.pbGlyphPng{
  display:block;
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter:
    drop-shadow(0 10px 26px rgba(0,0,0,0.55))
    drop-shadow(0 0 16px rgba(255,43,214,0.14))
    drop-shadow(0 0 14px rgba(0,229,255,0.14));
}
.pbHeaderPng{
  display:block;
  height: 32px;
  width: auto;
  object-fit: contain;
  filter:
    drop-shadow(0 12px 30px rgba(0,0,0,0.55))
    drop-shadow(0 0 18px rgba(0,229,255,0.16))
    drop-shadow(0 0 16px rgba(255,43,214,0.12));
}
.pbBottomPng{
  display:block;
  height: calc(100% - 12px);
  max-height: 100%;
  width: auto;
  object-fit: contain;
  opacity: .85;
  filter:
    drop-shadow(0 10px 24px rgba(0,0,0,0.55))
    drop-shadow(0 0 14px rgba(0,229,255,0.12));
}

.pbWelcomeWord{ opacity: 0.98; }
.pbWelcomeWord.strong{ opacity: 1; }
.pbHeroSub{
  margin-top: 6px;
  opacity: .78;
  font-size: 14px;
  letter-spacing: .4px;
}

.pbTiles{
  display:flex;
  flex-direction:column;
  gap: clamp(10px, 1.9vh, 16px);
  flex: 1;
  min-height: 0;
  justify-content: flex-start;

  /* Let the main scroll container handle vertical overflow.
     (Previously this was overflow:hidden which cropped lower menu items like Couch/AI/Settings/Credits.) */
  overflow: visible;
  padding-right: 0;
}

.pbTile{
  /* Big, uniform tile sizing (AAA menu feel) */
  height: clamp(120px, 18vh, 190px);
  flex: 0 0 auto;

  /* Per-tile accent colors (overridden by accent classes below) */
  --c1: 0,229,255;   /* cyan */
  --c2: 255,43,214;  /* magenta */
  --c3: 255,215,0;   /* gold */

  /* AAA "off-panel" illusion (Valorant/ARCADE style):
     Make each tile *wider than its panel* and offset it so its far/right edge is always off-screen.
     This also prevents a visible gap on hover when the tile slides left. */
  --pbOverhang: clamp(260px, 26vw, 560px);
  width: calc(100% + var(--pbOverhang));
  margin-right: calc(var(--pbOverhang) * -1);

  position: relative;
  text-align:left;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;

  /* Menu-style: dark panel base (accents are on the glyph/text, not the whole card) */
  background:
    linear-gradient(90deg, rgba(22,24,34,0.96), rgba(16,18,26,0.92));
  padding: 0;
  cursor: pointer;

  /* Keep inner VFX inside the tile, but shadows still render outside */
  overflow: hidden;

  box-shadow:
    0 14px 44px rgba(0,0,0,.62),
    0 0 0 1px rgba(255,255,255,0.06) inset;

  transition:
    transform .18s cubic-bezier(.2,.9,.2,1),
    box-shadow .22s cubic-bezier(.2,.9,.2,1),
    filter .22s cubic-bezier(.2,.9,.2,1);
}
.pbTile:before{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;

  /* Menu-style diagonal cut + subtle sheen */
  background:
    linear-gradient(135deg,
      rgba(255,255,255,0.10) 0%,
      rgba(255,255,255,0.05) 28%,
      rgba(0,0,0,0.00) 58%);
  clip-path: polygon(0 0, 42% 0, 30% 100%, 0 100%);
  opacity: 0.95;
}


/* =========================
   MENU TILE ACCENTS (safe)
   ========================= */
.pbTile.accentPeach{ --acc: 255, 182, 150; }   /* peach */
.pbTile.accentWhite{ --acc: 255, 255, 255; }   /* white */
.pbTile.accentYellow{ --acc: 255, 220, 90; }   /* yellow */
.pbTile.accentGreen{ --acc: 95, 255, 145; }    /* green */
.pbTile.accentPurple{ --acc: 200, 150, 255; }  /* purple */
.pbTile.accentBlue{ --acc: 80, 170, 255; }    /* blue */

/* Hover glow blink (only while hovered) */
@keyframes pbGlowBlink {
  0%{
    box-shadow:
      0 20px 62px rgba(0,0,0,.66),
      0 0 0 1px rgba(255,255,255,0.08) inset,
      0 0 0 1px rgba(var(--acc,255,255,255),0.14),
      0 0 16px rgba(var(--acc,255,255,255),0.10),
      0 0 34px rgba(var(--acc,255,255,255),0.08);
  }
  50%{
    box-shadow:
      0 22px 66px rgba(0,0,0,.70),
      0 0 0 1px rgba(255,255,255,0.10) inset,
      0 0 0 1px rgba(var(--acc,255,255,255),0.24),
      0 0 22px rgba(var(--acc,255,255,255),0.22),
      0 0 46px rgba(var(--acc,255,255,255),0.14);
  }
  100%{
    box-shadow:
      0 20px 62px rgba(0,0,0,.66),
      0 0 0 1px rgba(255,255,255,0.08) inset,
      0 0 0 1px rgba(var(--acc,255,255,255),0.16),
      0 0 18px rgba(var(--acc,255,255,255),0.12),
      0 0 38px rgba(var(--acc,255,255,255),0.10);
  }
}
@keyframes pbGlowOverlay {
  0%{ opacity: 0.62; }
  50%{ opacity: 0.92; }
  100%{ opacity: 0.70; }
}
/* Neon border + scanline shimmer (AAA "juicy" feel) */
.pbTile:after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius: inherit;

  /* Accent wash (very subtle) */
  background:
    linear-gradient(90deg,
      rgba(var(--acc, 255,255,255), 0.22) 0%,
      rgba(var(--acc, 255,255,255), 0.08) 28%,
      rgba(0,0,0,0.00) 60%);
  mix-blend-mode: screen;
  opacity: 0.55;
  transform: none;
  animation: none;
}
.pbTile:hover:after{
  opacity: 0.78;
  transform: none;
  animation: pbGlowOverlay 1.05s infinite;
}

.pbTile:hover{
  transform: translateX(-34px) translateY(-6px) scale(1.01);
  box-shadow:
    0 20px 62px rgba(0,0,0,.66),
    0 0 0 1px rgba(255,255,255,0.08) inset,
    0 0 0 1px rgba(var(--acc,255,255,255),0.18);
  animation: pbGlowBlink 1.05s infinite;
  filter: brightness(1.04) saturate(1.06);
}
.pbTile:active{
  transform: translateX(-34px) translateY(-2px) scale(0.985);
}
.pbTile.disabled,
.pbTile:disabled{
  cursor:not-allowed;
  opacity:.55;
  filter: grayscale(.2);
}
.pbTile.disabled:hover,
.pbTile:disabled:hover{
  transform:none;
  box-shadow:none;
  filter:none;
  animation:none;
}
.pbTile.disabled:hover:after,
.pbTile:disabled:hover:after{
  animation:none;
  opacity: 0.55;
}

.pbTileInner{
  display:flex;
  align-items:center;
  gap: clamp(12px, 2vh, 18px);
  padding: clamp(10px, 1.9vh, 18px) clamp(12px, 2.2vh, 18px);
}

.pbTileGlyph{
  position: relative;
  width: clamp(68px, 10vh, 96px);
  height: clamp(44px, 7vh, 58px);
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight: 1000;
  letter-spacing: 2px;
  font-size: clamp(30px, 5.2vh, 44px);
  opacity: .95;
  text-shadow: 0 3px 16px rgba(0,0,0,.6);
}

/* Glyph should float: no visible plate/container behind the PNGs */
.pbTileGlyph::before{ content: none; }
.pbTileGlyph > *{ position: relative; z-index: 1; }

.pbTileText{
  display:flex;
  flex-direction:column;
  gap: 4px;
  min-width:0;
}
.pbTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  font-weight: 1000;
  letter-spacing: 3px;
  font-size: clamp(22px, 4.2vh, 34px);
  text-transform: uppercase;
  line-height:1.05;
}
.pbTileDesc{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  opacity: .75;
  letter-spacing: 1.4px;
  font-size: 12px;
  text-transform: uppercase;
}

.pbFine{
  margin-top: 14px;
  opacity: .7;
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 12px;
}

.pbBottomRow{
  display:flex;
  gap: 12px;
  margin-top: 14px;
}
.pbMiniBtn{
  --miniAcc: 255,255,255;
  flex:1;
  border-radius: 10px;
  padding: 12px 14px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  color: #eaeaea;
  cursor:pointer;
  transition: transform .12s ease, filter .12s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
  box-shadow:
    0 12px 30px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.06) inset;
}
.pbMiniBtn:hover{
  transform: translateY(-1px);
  filter: brightness(1.03);
  border-color: rgba(var(--miniAcc),0.26);
  box-shadow:
    0 16px 38px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.07) inset,
    0 0 16px rgba(var(--miniAcc),0.10);
}

/* Image mini buttons (GO / CREATE / REFRESH): keep the same theme + subtle lift */
.pbMiniBtn.imgBtn{
  transition: transform .12s ease, background .12s ease, filter .12s ease, box-shadow .18s ease, border-color .18s ease;
}
.pbMiniBtn.imgBtn:hover{
  background:
    linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
    linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  transform: translateY(-1px);
  filter: none;
}
.pbMiniBtn.imgBtn:active{
  transform: translateY(0px) scale(0.98);
}


/* ===== Lobby (ARCADE-inspired card + form) ===== */
.pbCard{
  margin-top: 6px;
  margin-left: auto;
  margin-right: auto;
  max-width: 660px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background:
    radial-gradient(900px 420px at 20% 0%, rgba(160,120,255,0.18), transparent 60%),
    radial-gradient(900px 420px at 100% 80%, rgba(0,229,255,0.14), transparent 62%),
    linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.22));
  box-shadow:
    0 18px 60px rgba(0,0,0,0.55),
    0 0 0 1px rgba(0,0,0,0.30) inset;
  padding: 14px 14px 12px;
  backdrop-filter: blur(10px);
}
.pbTitleRow{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap: 12px;
  margin-top: 4px;
}
.pbTitle{
  font-weight: 1000;
  letter-spacing: 2.2px;
  text-transform: uppercase;
  font-size: 14px;
  opacity: .92;
}
.pbHint{
  font-weight: 900;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  font-size: 11px;
  opacity: .65;
}
.pbDivider{
  height: 1px;
  background: rgba(255,255,255,0.10);
  margin: 12px 0;
}
.pbForm{
  display:grid;
  gap: 10px;
  margin-top: 10px;
}
.pbField{
  display:grid;
  gap: 6px;
}
.pbField > span{
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: .75;
  font-weight: 900;
}
.pbField.inline{
  grid-template-columns: 1fr auto;
  align-items:center;
}
.pbInput{
  width: 100%;
  border-radius: 10px;
  padding: 12px 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.35);
  color: #eaeaea;
  outline: none;
  font-weight: 800;
  letter-spacing: .6px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.28) inset;
}
.pbInput:focus{
  border-color: rgba(0,229,255,0.26);
  box-shadow: 0 0 0 1px rgba(0,229,255,0.10) inset, 0 0 22px rgba(0,229,255,0.10);
}
.pbCheck{
  width: 18px;
  height: 18px;
  accent-color: rgb(200,160,255);
}
.pbRow{
  display:flex;
  gap: 10px;
  margin-top: 10px;
}
.pbMiniBtn.primary{
  background:
    linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04)),
    linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  border-color: rgba(255,255,255,0.18);
  box-shadow:
    0 16px 40px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.08) inset;
}
.pbFineLine{
  margin-top: 10px;
  opacity: .75;
  font-size: 12px;
  letter-spacing: .8px;
}
.pbLobbyList{
  display:grid;
  gap: 10px;
  margin-top: 10px;
}
.pbLobbyRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.28);
  transition: transform .14s ease, border-color .14s ease, background .14s ease;
}
.pbLobbyRow:hover{
  transform: translateX(-10px);
  border-color: rgba(255,255,255,0.16);
  background: rgba(0,0,0,0.34);
}
.pbLobbyInfo{
  min-width: 0;
  display:flex;
  flex-direction:column;
  gap: 4px;
}
.pbLobbyName{
  font-weight: 1000;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pbLobbyMeta{
  font-size: 12px;
  opacity: .75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pbLobbyMeta .dot{
  margin: 0 8px;
  opacity: .55;
}
.joinBtn{
  flex: 0 0 auto;
  min-width: 110px;
}

/* Responsive: keep everything visible on smaller screens */
@media (max-width: 700px) {
  .pbPageTitle{ font-size: 34px; }
  .pbHeroTitle{ font-size: 30px; }
  .pbTileGlyph{ width: 74px; font-size: 34px; }
  .pbTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 font-size: 26px; }
  .pbTileInner{ padding: 14px 14px; gap: 14px; }
}
@media (max-width: 420px) {
  .pbHeaderRow{ flex-wrap: wrap; }
  .pbIgn{ width: 100%; justify-content: flex-start; }
}

/* Short viewports: tighten the menu to avoid scrolling */
@media (max-height: 820px) {
  .pbShell{ padding: 10px 0 12px; max-height: calc(100vh - 86px); }
  .pbHeroSub{ font-size: 13px; }
  .pbTileDesc{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 font-size: 11px; }
}



/* Menu-style top & bottom bars (menus) */
.topbar.pbBar{
  min-height: 64px;
  height: auto;
  padding: 10px 18px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.22));
  border-bottom: 1px solid rgba(255,255,255,0.10);
  justify-content: space-between;
  align-items: flex-start;
}
.pbTopLeft{ display:flex; flex-direction:column; align-items:flex-start; gap: 6px; min-width: 0; }
.pbTopTitle{
  font-weight: 1000;
  letter-spacing: 2.2px;
  font-size: 34px;
  opacity: .75;
  text-transform: uppercase;
}
.pbTopTitlePng{
  height: 34px;
  width: auto;
  display: block;
  opacity: .85;
  image-rendering: pixelated;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.45));
}
.pbTopRight{ display:flex; align-items:center; gap: 12px; margin-left:auto; }
.pbTopAvatar{
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,.35);
  box-shadow: 0 10px 24px rgba(0,0,0,.45);
}
.topAvatar{
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,.35);
  margin-right: 8px;
}
.pbTopIgn{
  display:flex;
  align-items:baseline;
  gap:10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,0.10);
}
.pbTopIgnLabel{ font-size: 11px; letter-spacing: 2px; opacity:.65; }
.pbTopIgnName{ font-weight: 1000; letter-spacing: 1px; }
.pbTopBtn{
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  color: #eaeaea;
  box-shadow:
    0 12px 32px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.06) inset;
  cursor: pointer;
  transition: transform .08s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, filter .18s ease;
}

.pbBackRow{
  /* IMPORTANT: The back button must NOT push the menu down when it appears.
     Keep it visually below the top bar, but take it out of document flow. */
  position: absolute;
  left: 0;
  top: 70px; /* sits right under the ARCADE top bar */
  width: 100%;

  padding: 10px 18px 0;
  display: flex;
  justify-content: flex-start;

  z-index: 3;
  pointer-events: none;
}
.pbBackBtn{
  border-radius: 12px;
  padding: 12px 18px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(22,24,34,0.92), rgba(16,18,26,0.88));
  color: #eaeaea;
  box-shadow:
    0 12px 32px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.06) inset;
  cursor: pointer;
  pointer-events: auto;
}
.pbBackBtn:hover{
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.26);
  box-shadow:
    0 16px 40px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.07) inset,
    0 0 18px rgba(255,255,255,0.10);
  filter: brightness(1.03);
}

.pbTopBtn:hover{
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.26);
  box-shadow:
    0 16px 40px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.07) inset,
    0 0 18px rgba(255,255,255,0.10);
  filter: brightness(1.03);
}
.pbTopBtn.under{
  padding: 8px 12px;
  border-radius: 10px;
}
.pbTopBtn.under:hover{ transform: translateY(-1px); }


.pbBottomBar{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 62px;
  z-index: 25;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding: 0 16px;
  background: linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.62));
  border-top: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(10px);
  pointer-events: none;
}
.pbBottomLeft{ display:flex; align-items:center; flex: 1; min-width: 0; height: 100%; }
.pbBottomCenter{ display:flex; align-items:center; justify-content:center; gap: 12px; flex: 1; min-width: 0; height: 100%; }
.pbBottomRight{ display:flex; align-items:center; justify-content:flex-end; flex: 1; min-width: 0; }
.pbBottomLogo{
  width: 30px; height: 30px; object-fit: contain;
  filter: drop-shadow(0 10px 22px rgba(0,0,0,0.55));
}
.pbBottomBrand{ font-weight: 1000; letter-spacing: 2px; opacity:.75; text-transform: uppercase; }
.pbBottomBrandPng{
  height: calc(100% - 12px);
  max-height: 100%;
  width: auto;
  object-fit: contain;
  opacity: .85;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,0.55));
}
.pbBottomHint{ opacity:.55; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; height: 100%; display:flex; align-items:center; }
.pbBottomBackBtn{ pointer-events: auto; }

/* Floating PNG buttons */
.imgBtn{ display:inline-flex; align-items:center; justify-content:center; }
.btnPng{ height: 22px; width: auto; object-fit: contain; pointer-events: none; }
.pbMiniBtn.imgBtn{ padding-top: 6px; padding-bottom: 6px; }
.brandTitlePng{ height: 100%; width: auto; object-fit: contain; max-height: 44px; }
/* floatingLogo sets fixed 40x40; override so the title can fill the in-game top bar slot */
.brandTitlePng.floatingLogo{ height: 100% !important; width: auto !important; max-height: 44px !important; }



.tbYouTag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  opacity: 0.75;
  margin-left: 8px;
  vertical-align: middle;
}

/* ── Draft timer P2 (red) ───────────────────────────────────────── */
.tbDraftTimer.tbDraftP2 {
  border-color: rgba(255, 64, 96, 0.35);
  background: rgba(255, 64, 96, 0.10);
  color: rgba(255, 64, 96, 0.95);
}
.tbDraftTimer.tbDraftP2.tbDraftUrgent {
  border-color: rgba(255, 40, 60, 0.65);
  background: rgba(255, 40, 60, 0.18);
  color: rgba(255, 80, 100, 0.98);
}

/* ============================================================
   VS-STYLE PANEL (Settings / Credits / Lobby header)
   Matches the VS AI overlay aesthetic
   ============================================================ */
.vsStylePanel {
  width: min(560px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  animation: vsAiPanelIn .28s cubic-bezier(.22,1,.36,1);
}

.vsStyleHeader {
  position: relative;
  text-align: center;
  padding: 0 0 24px;
  overflow: hidden;
}

.vsStyleHeaderGlow {
  position: absolute;
  inset: -40px;
  background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(0,229,255,0.18), transparent 70%);
  filter: blur(20px);
  pointer-events: none;
}

.vsStyleTitle {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  background: linear-gradient(90deg, rgba(0,229,255,1), rgba(180,80,255,1), rgba(255,43,214,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  position: relative;
}

.vsStyleSubtitle {
  font-size: 12px;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: .45;
  margin-top: 4px;
  position: relative;
}

.vsStyleCards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vsStyleCard {
  position: relative;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.12);
  background: #1a1c28;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  transition: border-color .2s, background .2s;
}

.vsStyleCard::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 120% 200% at 0% 50%, rgba(0,229,255,0.06), transparent 60%);
  pointer-events: none;
}

.vsStyleCardTitle {
  font-size: 10px;
  letter-spacing: 3px;
  font-weight: 900;
  text-transform: uppercase;
  opacity: .4;
  margin-bottom: 10px;
}

.vsStyleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
}
.vsStyleRow:last-of-type { border-bottom: none; }
.vsStyleRow.slider { align-items: center; gap: 14px; }

.vsStyleRowLabel {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  opacity: .85;
}

.vsStyleCheck {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: rgba(0,229,255,0.9);
  flex-shrink: 0;
}

.vsStyleSlider {
  flex: 1;
  accent-color: rgba(0,229,255,0.9);
  min-width: 80px;
}

.vsStyleSliderVal {
  font-size: 13px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  opacity: .85;
  min-width: 42px;
  text-align: right;
  letter-spacing: 1px;
}

.vsStyleFinePrint {
  font-size: 11px;
  opacity: .4;
  text-align: center;
  letter-spacing: 1px;
  padding-top: 6px;
}

/* Credits card specific */
.creditCard {
  gap: 0;
  padding: 20px 22px;
}
.creditLine {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 9px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.creditLine:last-of-type { border-bottom: none; }
.creditLabel {
  font-size: 10px;
  letter-spacing: 3px;
  font-weight: 900;
  opacity: .4;
  text-transform: uppercase;
  min-width: 70px;
}
.creditValue {
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 1px;
  opacity: .92;
}
.creditDivider {
  height: 1px;
  background: rgba(255,255,255,0.10);
  margin: 4px 0;
}

/* Close button for settings/credits (reuse vsAiClose) */
.vsStyleClose {
  margin-top: 16px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 10px;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: color .15s, border-color .15s;
  align-self: center;
  width: 100%;
  font-family: inherit;
}
.vsStyleClose:hover {
  color: rgba(255,255,255,0.8);
  border-color: rgba(255,255,255,0.25);
}

/* Lobby wrapped in vsStylePanel */
.vsStylePanel > .vsStyleCards > .pbCard {
  width: 100%;
  max-width: 100%;
  margin: 0;
}

.menuBtn::before, .menuBtn::after { content: none !important; }



/* Hard overrides to remove heavy effects on menu buttons */
.menuBtn, .menuBtn:hover, .menuBtn:active,
.menuBtn.primary, .menuBtn.primary:hover, .menuBtn.primary:active,
.menuBtn.alt, .menuBtn.alt:hover, .menuBtn.alt:active {
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
}

.menuBtn::before, .menuBtn::after,
.menuBtn.primary::before, .menuBtn.primary::after,
.menuBtn.alt::before, .menuBtn.alt::after {
  content: none !important;
  display: none !important;
}


/* =========================
   ✅ Quick Match Accept UI
========================= */
.qmBar{
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
  margin-top: 8px;
}
.qmBarFill{
  height: 100%;
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(36,255,204,0.85), rgba(180,90,255,0.9), rgba(255,70,180,0.9));
  transition: width 80ms linear;
}
.qmBar.danger{
  background: rgba(255,60,60,0.08);
}
.qmBar.danger .qmBarFill{
  background: linear-gradient(90deg, rgba(255,80,80,0.9), rgba(255,40,80,0.9));
}
.dangerPulse{
  animation: qmPulse 420ms ease-in-out infinite;
  box-shadow: 0 0 0 1px rgba(255,80,80,0.25), 0 10px 40px rgba(255,0,80,0.12) !important;
  border-color: rgba(255,64,96,0.25) !important;
}
@keyframes qmPulse{
  0%,100%{ transform: scale(1); }
  50%{ transform: scale(1.015); }
}
.loadTitlePng{
  height: 22px;
  width: auto;
  image-rendering: pixelated;
}

/* ══════════════════════════════════════════════════════════════
   AUTH MODAL
═══════════════════════════════════════════════════════════════ */
.authOverlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 16px;
}
.authFade-enter-active, .authFade-leave-active{ transition: opacity .2s ease, transform .22s cubic-bezier(.22,1,.36,1); }
.authFade-enter-from, .authFade-leave-to{ opacity:0; transform: scale(0.95) translateY(8px); }

.authCard{
  width: min(440px, 100%);
  border-radius: 20px;
  border: 1px solid rgba(80,170,255,0.22);
  background: linear-gradient(180deg, rgba(16,16,28,0.98), rgba(10,10,22,0.96));
  box-shadow:
    0 24px 80px rgba(0,0,0,0.7),
    0 0 0 1px rgba(80,170,255,0.08) inset,
    0 0 60px rgba(80,170,255,0.12);
  overflow: hidden;
  animation: popIn .22s cubic-bezier(.22,1,.36,1);
}

.authStripe{
  height: 3px;
  background: linear-gradient(90deg, rgba(80,170,255,0.5), rgba(80,200,255,1), rgba(80,170,255,0.5));
}

.authInner{ padding: 20px 22px 24px; }

.authHead{
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.authIconDot{
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgba(80,170,255,0.9);
  box-shadow: 0 0 10px rgba(80,170,255,0.5);
}
.authTitle{
  flex: 1;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
}
.authClose{
  width: 28px; height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.55);
  font-size: 13px;
  cursor: pointer;
  display:flex; align-items:center; justify-content:center;
  transition: background .12s, color .12s;
}
.authClose:hover{ background: rgba(255,255,255,0.10); color:#fff; }

/* ── Tabs ── */
.authTabs{
  display: flex;
  gap: 4px;
  background: rgba(0,0,0,0.3);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 18px;
  border: 1px solid rgba(255,255,255,0.07);
}
.authTab{
  flex: 1;
  padding: 9px 10px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .14s, color .14s, box-shadow .14s;
}
.authTab.active{
  background: rgba(80,170,255,0.14);
  color: rgba(80,170,255,0.95);
  box-shadow: 0 0 0 1px rgba(80,170,255,0.22) inset;
}
.authTab:hover:not(.active){ color: rgba(255,255,255,0.75); }

/* ── Form fields ── */
.authForm{ display:grid; gap: 13px; }

.authField{
  display: grid;
  gap: 6px;
}
.authField > span{
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: .7;
  font-weight: 900;
}
.authFieldHint{
  font-size: 10px;
  opacity: .55;
  letter-spacing: 1px;
  text-transform: none;
  font-weight: 600;
}
.authInput{
  width: 100%;
  border-radius: 10px;
  padding: 13px 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.4);
  color: #eaeaea;
  outline: none;
  font-weight: 800;
  letter-spacing: .6px;
  font-size: 14px;
  transition: border-color .15s, box-shadow .15s;
  box-sizing: border-box;
}
.authInput:focus{
  border-color: rgba(80,170,255,0.35);
  box-shadow: 0 0 0 1px rgba(80,170,255,0.12) inset, 0 0 22px rgba(80,170,255,0.10);
}

.authError{
  padding: 10px 13px;
  border-radius: 10px;
  background: rgba(255,64,96,0.10);
  border: 1px solid rgba(255,64,96,0.22);
  color: rgba(255,100,120,0.95);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .5px;
}

/* ── Submit button ── */
.authSubmit{
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(80,170,255,0.30);
  background: linear-gradient(180deg, rgba(80,170,255,0.18), rgba(80,170,255,0.08));
  color: rgba(80,170,255,0.95);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background .15s, border-color .15s, box-shadow .15s, transform .1s;
  box-shadow: 0 8px 28px rgba(0,0,0,0.4), 0 0 20px rgba(80,170,255,0.07);
}
.authSubmit:hover:not(:disabled){
  background: linear-gradient(180deg, rgba(80,170,255,0.26), rgba(80,170,255,0.14));
  border-color: rgba(80,170,255,0.50);
  box-shadow: 0 10px 32px rgba(0,0,0,0.45), 0 0 28px rgba(80,170,255,0.14);
  transform: translateY(-1px);
}
.authSubmit:disabled{ opacity: .6; cursor: not-allowed; }

/* Loading spinner */
.authSpinner{
  width: 14px; height: 14px;
  border: 2px solid rgba(80,170,255,0.3);
  border-top-color: rgba(80,170,255,0.9);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin{ to{ transform: rotate(360deg); } }

/* ── Perks (signup) ── */
.authPerks{
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.authPerk{
  flex: 1;
  min-width: 120px;
  padding: 8px 10px;
  border-radius: 9px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  font-size: 11px;
  letter-spacing: .5px;
  opacity: .75;
}

/* auth field slide transition */
.authField-enter-active{ transition: all .18s ease; }
.authField-enter-from{ opacity:0; transform:translateY(-4px); }
.authField-leave-active{ transition: all .14s ease; }
.authField-leave-to{ opacity:0; transform:translateY(-4px); }

/* ── Page transition: fade to black / fade from black ── */
.pageWrap{ display: contents; }

/* Two-bar curtain transition */
.pageCurtainTop,
.pageCurtainBot {
  position: fixed;
  left: 0;
  right: 0;
  height: 50%;
  z-index: 8000;
  pointer-events: none;
  transform: scaleY(0);
  transition: transform 0.35s cubic-bezier(0.76, 0, 0.24, 1);
}
.pageCurtainTop {
  top: 0;
  transform-origin: top center;
}
.pageCurtainBot {
  bottom: 0;
  transform-origin: bottom center;
}
.pageCurtainTop.active,
.pageCurtainBot.active {
  transform: scaleY(1);
  pointer-events: all;
}

/* ── YouTube custom fullscreen modal ── */
.ytModalOverlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 9100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ytModalFade-enter-active{ transition: opacity .25s ease, transform .25s cubic-bezier(.22,1,.36,1); }
.ytModalFade-leave-active{ transition: opacity .18s ease, transform .18s ease; }
.ytModalFade-enter-from{ opacity: 0; transform: scale(0.95); }
.ytModalFade-leave-to{ opacity: 0; transform: scale(0.97); }

.ytModalContainer{
  position: relative;
  width: min(900px, 100%);
  border-radius: 16px;
  border: 1.5px solid rgba(80,170,255,0.35);
  box-shadow:
    0 0 0 1px rgba(80,170,255,0.08) inset,
    0 30px 80px rgba(0,0,0,0.8),
    0 0 60px rgba(80,170,255,0.15);
  overflow: visible;
  background: #050508;
}
.ytModalFrame{
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
}
.ytModalIframe{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 14px;
}
.ytModalClose{
  position: absolute;
  top: -44px;
  right: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(80,170,255,0.12);
  border: 1px solid rgba(80,170,255,0.35);
  border-radius: 10px;
  padding: 8px 14px;
  color: rgba(80,200,255,0.95);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  transition: background .15s, border-color .15s, box-shadow .15s, transform .12s;
}
.ytModalClose:hover{
  background: rgba(80,170,255,0.22);
  border-color: rgba(80,200,255,0.55);
  box-shadow: 0 0 18px rgba(80,170,255,0.2);
  transform: translateY(-1px);
}
.ytModalCloseIcon{ font-size: 13px; }
.ytModalCloseLabel{ font-size: 10px; }


/* ══════════════════════════════════════════════════════════════
   TOPBAR — Member status upgrades
═══════════════════════════════════════════════════════════════ */
.pbTopAvatarWrap{
  position: relative;
  display: inline-flex;
}
.pbTopOnlineDot{
  position: absolute;
  bottom: -2px; right: -2px;
  width: 9px; height: 9px;
  border-radius: 50%;
  background: #4dff90;
  border: 2px solid rgba(10,10,20,0.9);
  box-shadow: 0 0 6px rgba(77,255,144,0.7);
}
.pbTopAvatarMember .pbTopAvatar{
  border-color: rgba(80,170,255,0.35);
  box-shadow: 0 0 14px rgba(80,170,255,0.18), 0 10px 24px rgba(0,0,0,.45);
}
.pbTopIgnMember{
  border-color: rgba(80,170,255,0.18) !important;
  background: rgba(80,170,255,0.07) !important;
}
.pbTopIgnMember .pbTopIgnLabel{
  color: rgba(80,170,255,0.8);
}
.pbTopIgnMember .pbTopIgnName{
  color: rgba(80,170,255,0.95);
}
.pbTopLogoutBtn{
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.45);
  font-size: 15px;
  cursor: pointer;
  display:flex; align-items:center; justify-content:center;
  transition: background .12s, color .12s, border-color .12s;
  flex-shrink: 0;
}
.pbTopLogoutBtn:hover{
  background: rgba(255,64,96,0.12);
  border-color: rgba(255,64,96,0.25);
  color: rgba(255,80,100,0.9);
}


/* ══════════════════════════════════════════════════════════════
   MODE MENU — Member / Guest strips
═══════════════════════════════════════════════════════════════ */
.pbMemberStrip{
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(80,170,255,0.07);
  border: 1px solid rgba(80,170,255,0.16);
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-weight: 900;
  color: rgba(80,170,255,0.85);
  flex-wrap: wrap;
}
.pbMemberStripDot{
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #4dff90;
  box-shadow: 0 0 6px rgba(77,255,144,0.8);
  flex-shrink: 0;
}
.pbMemberStripText{ flex: 1; }
.pbMemberStripRight{ opacity: .7; font-size: 10px; }

.pbGuestStrip{
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  opacity: .65;
  flex-wrap: wrap;
}
.pbGuestLoginBtn{
  margin-left: auto;
  background: none;
  border: none;
  color: rgba(80,170,255,0.8);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.2px;
  cursor: pointer;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background .12s, color .12s;
}
.pbGuestLoginBtn:hover{
  background: rgba(80,170,255,0.10);
  color: rgba(80,170,255,1);
}


/* ══════════════════════════════════════════════════════════════
   WELCOME SCREEN — new tiles
═══════════════════════════════════════════════════════════════ */
.pbTile.accentCyan{ --acc: 0, 229, 255; }
.pbTileSignup .pbTileGlyph{
  font-size: clamp(28px, 4.5vh, 38px);
  color: rgba(0,229,255,0.85);
}

/* Member glyph (logged-in CONTINUE tile) */
.pbMemberGlyph{
  display: flex;
  align-items: center;
  justify-content: center;
}
.pbMemberDot{
  width: 18px; height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, rgba(77,255,144,1), rgba(0,200,100,0.8));
  box-shadow: 0 0 18px rgba(77,255,144,0.6), 0 0 32px rgba(77,255,144,0.3);
  animation: memberPulse 2s ease-in-out infinite;
}
@keyframes memberPulse{
  0%,100%{ box-shadow: 0 0 18px rgba(77,255,144,0.6), 0 0 32px rgba(77,255,144,0.3); }
  50%{ box-shadow: 0 0 28px rgba(77,255,144,0.85), 0 0 48px rgba(77,255,144,0.45); }
}
.pbMemberDesc{ color: rgba(255,255,255,0.65) !important; }
.pbMemberName{ color: #4dff90; font-weight: 900; }


/* ══════════════════════════════════════════════════════════════
   PLAY / CASUAL / VS AI — section labels between tiles
═══════════════════════════════════════════════════════════════ */
.pbSectionLabel{
  width: 100%;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: .45;
  padding: 4px 2px 2px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  margin-bottom: 2px;
  pointer-events: none;
}

/* Small online dot for profile tile glyph */
.pbMemberDotSm{
  display: inline-block;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, rgba(77,255,144,1), rgba(0,200,100,0.8));
  box-shadow: 0 0 14px rgba(77,255,144,0.7);
  animation: memberPulse 2s ease-in-out infinite;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TETR.IO-INSPIRED MENU SYSTEM
   Full-width rows · Dark panel · Accent glow · Contextual status bar
══════════════════════════════════════════════════════════════════════════════ */

/* ── Top bar ──────────────────────────────────────────────────────────────── */
.tetBar{
  background: rgba(8,8,16,0.92) !important;
  border-bottom: 1px solid rgba(255,255,255,0.08) !important;
  backdrop-filter: blur(14px) !important;
  height: 5.208vw !important;
  min-height: 5.208vw !important;
  max-height: 5.208vw !important;
  padding: 0 18px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  overflow: hidden !important;
}
.tetBarLeft{
  display: flex;
  align-items: center;
  gap: 20px;
}
.tetBarTitle{
  font-size: clamp(18px, 3vh, 24px);
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: .92;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
}
.tetBackBtn{
  background: none;
  border: none;
  color: rgba(255,255,255,0.55);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  transition: background .12s, color .12s;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
}
.tetBackBtn:hover{
  background: rgba(255,255,255,0.07);
  color: #fff;
}

/* Back button sitting just below the topbar, left-aligned under the title */
.subScreenBackBtn {
  position: fixed;
  top: calc(5.208vw + 12px);
  left: clamp(16px, 2.5vw, 40px);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 8px;
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 7px 16px;
  cursor: pointer;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  transition: background .12s, color .12s, border-color .12s;
  z-index: 20;
}
.subScreenBackBtn:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
  border-color: rgba(255,255,255,0.32);
}
.subScreenLogoutBtn {
  background: rgba(220, 38, 60, 0.12);
  border-color: rgba(220, 38, 60, 0.35);
  color: rgba(255, 80, 100, 0.9);
}
.subScreenLogoutBtn:hover {
  background: rgba(220, 38, 60, 0.22);
  border-color: rgba(220, 38, 60, 0.6);
  color: #ff6070;
}

/* ── Global nav overlay — sits above .main stacking context ── */
.gNavOverlay {
  position: fixed;
  top: 0; left: 0;
  width: 0; height: 0;
  z-index: 100;
  pointer-events: none;
}
.gNavOverlay > * { pointer-events: auto; }

/* ── Figma back / logout buttons ── */
.figmaNavBtn {
  position: fixed;
  top: calc(5.208vw + 20px);
  left: 0;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
  width: auto;
  transform: translateX(-6px);
  transform-origin: left center;
  transition: transform 0.18s cubic-bezier(0.25, 0.8, 0.25, 1), filter 0.18s ease;
  z-index: 100;
}
.figmaNavBtn:hover  { transform: translateX(4px); filter: brightness(1.12) saturate(1.1); }
.figmaNavBtn:active { transform: translateX(1px) scale(0.997); filter: brightness(1.05); }
.figmaNavBtnImg {
  display: block;
  width: auto;
  height: clamp(26px, 2.6vw, 38px);
  object-fit: contain;
}
/* vsai uses absolute positioning inside its shell */
.vsaiFigmaBackBtn {
  position: absolute;
  top: 20px;
}
.tetBarRight{
  display: flex;
  align-items: center;
  gap: 10px;
}
.tetBarUser{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer;
  transition: background .12s;
}
.tetBarUser:hover{ background: rgba(255,255,255,0.06); }
.tetBarUserMember{ border-color: rgba(80,170,255,0.18); }
.tetBarAvatarWrap{ position: relative; display: inline-flex; }
.tetBarAvatar{
  width: 28px; height: 28px;
  border-radius: 7px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,0.12);
}
.tetBarOnlineDot{
  position: absolute;
  bottom: -2px; right: -2px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #4dff90;
  border: 2px solid rgba(8,8,16,0.9);
  box-shadow: 0 0 6px rgba(77,255,144,0.7);
}
.tetBarIgnName{
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.5px;
}
.tetBarUserMember .tetBarIgnName{ color: rgba(80,170,255,0.9); }
.tetBarSignOutBtn{
  width: 30px; height: 30px;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.4);
  font-size: 14px;
  cursor: pointer;
  display:flex; align-items:center; justify-content:center;
  transition: background .12s, color .12s, border-color .12s;
}
.tetBarSignOutBtn:hover{
  background: rgba(255,64,96,0.12);
  border-color: rgba(255,64,96,0.3);
  color: rgba(255,80,100,0.9);
}

/* ══════════════════════════════════════════════════════
   REDESIGNED TOPBAR — social icons + enhanced user block
══════════════════════════════════════════════════════ */

/* Social icon buttons (friends + bell) */
.tetBarIconBtn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: none;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 8px;
  padding: 5px 9px;
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  transition: background .14s, color .14s, border-color .14s;
  font-family: 'Orbitron', system-ui, sans-serif;
}
.tetBarIconBtn:hover {
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.2);
}
.tetBarIconBtn.active {
  background: rgba(220,80,255,0.12);
  border-color: rgba(220,80,255,0.35);
  color: #dc50ff;
}
.tetBarIconSvg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}
.tetBarIconCount {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.5px;
  line-height: 1;
}
.tetBarIconCount.zero { opacity: 0.38; }
.tetBarNotifDot {
  position: absolute;
  top: 5px; right: 5px;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #ff4060;
  border: 2px solid rgba(8,8,16,0.92);
  box-shadow: 0 0 6px rgba(255,64,96,0.8);
}

/* Enhanced user block in topbar */
.tetBarIgn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}
.tetBarIgnMeta {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1;
}
.tetBarLevel {
  font-size: 10px;
  font-weight: 900;
  color: rgba(255,255,255,0.75);
  font-family: 'Orbitron', system-ui, sans-serif;
  letter-spacing: 0.5px;
}
.tetBarLevelSlash {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,0.35);
  letter-spacing: -1px;
}
.tetBarRankBadge {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  font-family: 'Orbitron', system-ui, sans-serif;
}
.tetRank-plastic    .tetBarRankBadge, .tetBarRankBadge.tetRank-plastic    { background: rgba(170,170,185,0.15); color: #aab; }
.tetRank-bronze     .tetBarRankBadge, .tetBarRankBadge.tetRank-bronze     { background: rgba(205,127,50,0.18);  color: #cd7f32; }
.tetRank-silver     .tetBarRankBadge, .tetBarRankBadge.tetRank-silver     { background: rgba(192,192,192,0.15); color: #c0c0c0; }
.tetRank-gold       .tetBarRankBadge, .tetBarRankBadge.tetRank-gold       { background: rgba(255,215,0,0.15);   color: #ffd700; }
.tetRank-platinum   .tetBarRankBadge, .tetBarRankBadge.tetRank-platinum   { background: rgba(100,220,255,0.15); color: #64dcff; }
.tetRank-diamond    .tetBarRankBadge, .tetBarRankBadge.tetRank-diamond    { background: rgba(100,160,255,0.18); color: #64a0ff; }
.tetRank-master     .tetBarRankBadge, .tetBarRankBadge.tetRank-master     { background: rgba(170,80,255,0.18);  color: #aa50ff; }
.tetRank-champion   .tetBarRankBadge, .tetBarRankBadge.tetRank-champion   { background: rgba(255,210,0,0.2);    color: #ffd200; }
.tetRank-unranked   .tetBarRankBadge, .tetBarRankBadge.tetRank-unranked   { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.35); }
.tetBarGuestTag {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.28);
  font-family: 'Orbitron', system-ui, sans-serif;
  text-transform: uppercase;
}

/* ══════════════════════════════════════════════════════
   FRIENDS / NOTIF SIDEBARS
══════════════════════════════════════════════════════ */
.pbSidebarOverlay {
  position: fixed;
  inset: 0;
  z-index: 600;
  pointer-events: none;
}
.pbSidebarOverlay > .pbSidebar { pointer-events: auto; }

.pbSidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  width: 340px;
  max-width: 92vw;
  background: rgba(10,10,18,0.97);
  border-right: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  z-index: 601;
  overflow: hidden;
}
.pbFriendsSidebar { left: 0; border-right: 1px solid rgba(255,255,255,0.09); }
.pbNotifSidebar   { right: 0; border-left: 1px solid rgba(255,255,255,0.09); border-right: none; }

.pbSidebarHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.pbSidebarHeadLeft {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pbSidebarTitle {
  font-family: 'Orbitron', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 3px;
  color: #fff;
  text-transform: uppercase;
}
.pbSidebarStatus {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.42);
  text-transform: uppercase;
}
.pbSidebarStatusDot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #4dff90;
  box-shadow: 0 0 6px rgba(77,255,144,0.6);
  flex-shrink: 0;
}
.pbSidebarClose {
  background: none;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 7px;
  color: rgba(255,255,255,0.38);
  font-size: 13px;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background .12s, color .12s;
}
.pbSidebarClose:hover { background: rgba(255,255,255,0.07); color: #fff; }

.pbSidebarSearch {
  display: flex;
  align-items: center;
  gap: 0;
  margin: 12px 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color .15s;
}
.pbSidebarSearch:focus-within {
  border-color: rgba(220,80,255,0.45);
  box-shadow: 0 0 0 2px rgba(220,80,255,0.08);
}
.pbSidebarSearchInput {
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
  font-family: 'Rajdhani', system-ui, sans-serif;
  width: 100%;
  padding: 9px 12px;
}
.pbSidebarSearchInput::placeholder { color: rgba(255,255,255,0.28); }
.pbSidebarSearchBtn {
  flex-shrink: 0;
  width: 38px; height: 38px;
  background: rgba(220,80,255,0.12);
  border: none;
  border-left: 1px solid rgba(255,255,255,0.08);
  color: #dc50ff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .13s, color .13s;
}
.pbSidebarSearchBtn:hover:not(:disabled) { background: rgba(220,80,255,0.22); }
.pbSidebarSearchBtn:disabled { opacity: 0.5; cursor: default; }
.pbSearchBtnIcon { width: 16px; height: 16px; }
.pbSearchBtnSpinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(220,80,255,0.3);
  border-top-color: #dc50ff;
  border-radius: 50%;
  animation: pbSpin .6s linear infinite;
  display: inline-block;
}
@keyframes pbSpin { to { transform: rotate(360deg); } }

/* Search results */
.pbSearchResultsHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 18px 4px;
  flex-shrink: 0;
}
.pbSearchResultsLabel {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
}
.pbSearchClear {
  background: none;
  border: none;
  color: rgba(255,255,255,0.28);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  font-family: 'Orbitron', system-ui, sans-serif;
  padding: 4px 0;
  transition: color .12s;
}
.pbSearchClear:hover { color: rgba(255,255,255,0.7); }

.pbSearchResultRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: background .12s;
}
.pbSearchResultRow:hover { background: rgba(255,255,255,0.03); }

.pbAddFriendBtn {
  flex-shrink: 0;
  width: 32px; height: 32px;
  background: rgba(220,80,255,0.10);
  border: 1px solid rgba(220,80,255,0.28);
  border-radius: 8px;
  color: #dc50ff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .13s, border-color .13s, transform .1s;
}
.pbAddFriendBtn:hover:not(:disabled) {
  background: rgba(220,80,255,0.22);
  border-color: rgba(220,80,255,0.5);
}
.pbAddFriendBtn:active { transform: scale(0.9); }
.pbAddFriendBtn:disabled { opacity: 0.4; cursor: default; }
.pbAddFriendIcon { width: 16px; height: 16px; }

.pbFriendStatusTag {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  padding: 3px 8px;
  font-family: 'Orbitron', system-ui, sans-serif;
  flex-shrink: 0;
}
.pbFriendStatusFriends { color: #4dff90; background: rgba(77,255,144,0.08); border-color: rgba(77,255,144,0.22); }
.pbFriendStatusYou     { color: #dc50ff; background: rgba(220,80,255,0.08); border-color: rgba(220,80,255,0.22); }

.pbSidebarTabs {
  display: flex;
  padding: 0 14px;
  gap: 2px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.pbSidebarTab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.35);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  padding: 10px 12px 8px;
  cursor: pointer;
  font-family: 'Orbitron', system-ui, sans-serif;
  transition: color .12s, border-color .12s;
}
.pbSidebarTab:hover   { color: rgba(255,255,255,0.7); }
.pbSidebarTab.active  { color: #fff; border-bottom-color: #fff; }

/* Badge on the Requests tab */
.pbSidebarTabBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #ff4060;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  margin-left: 5px;
  vertical-align: middle;
  line-height: 1;
}

/* Request list */
.pbRequestList {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.pbRequestRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: background .12s;
}
.pbRequestRow:hover { background: rgba(255,255,255,0.03); }
.pbRequestAvatar {
  width: 38px; height: 38px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,0.12);
  flex-shrink: 0;
}
.pbRequestInfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pbRequestName {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.5px;
  color: #fff;
  font-family: 'Orbitron', system-ui, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pbRequestSub {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  letter-spacing: 0.5px;
  font-family: 'Rajdhani', system-ui, sans-serif;
  font-weight: 600;
}
.pbFriendOnlineTag  { color: #4dff90; }
.pbFriendOfflineTag { color: rgba(255,255,255,0.25); }

/* Avatar with status dot */
.pbFriendAvatarWrap { position: relative; flex-shrink: 0; }
/* ═══════════════════════════════════════════════════
   CHAT WINDOWS  (bottom-left dock, League-style)
═══════════════════════════════════════════════════ */
.pbChatDock {
  position: fixed;
  bottom: 0;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 6px;
  z-index: 9000;
  pointer-events: none;
  transition: left .25s cubic-bezier(.4,0,.2,1);
}
.pbChatWindow {
  width: 300px;
  background: #12121e;
  border: 1px solid rgba(255,255,255,0.10);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: all;
  box-shadow: 0 -2px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
  transition: height .18s ease;
}
.pbChatWindow:not(.minimized) { height: 380px; }
.pbChatWindow.minimized        { height: 40px; }

/* Title bar — dark header like LoL */
.pbChatTitleBar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 8px 0 10px; height: 40px; flex-shrink: 0;
  background: #1c1c2e;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  cursor: pointer; user-select: none;
}
.pbChatTitleLeft { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.pbChatTitleAvatarWrap { position: relative; flex-shrink: 0; }
.pbChatTitleAvatar {
  width: 26px; height: 26px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.15); object-fit: cover; background: #2a2a40;
}
.pbChatTitleDot {
  position: absolute; bottom: 0px; right: 0px;
  width: 8px; height: 8px; border-radius: 50%; border: 2px solid #1c1c2e;
}
.pbChatTitleDot.online  { background: #4dff90; }
.pbChatTitleDot.offline { background: rgba(255,255,255,0.18); }
.pbChatTitleMeta {
  display: flex; flex-direction: column; gap: 0; min-width: 0;
}
.pbChatTitleName {
  font-family: 'Orbitron', system-ui, sans-serif;
  font-size: 11px; font-weight: 700; color: #fff;
  letter-spacing: 0.3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.2;
}
.pbChatTitleStatus {
  font-family: 'Rajdhani', system-ui, sans-serif;
  font-size: 10px; font-weight: 600; line-height: 1.2;
}
.pbChatTitleStatus.online  { color: #4dff90; }
.pbChatTitleStatus.offline { color: rgba(255,255,255,0.3); }
.pbChatTitleActions { display: flex; gap: 1px; flex-shrink: 0; }
.pbChatTitleBtn {
  width: 24px; height: 24px; background: none; border: none;
  color: rgba(255,255,255,0.35); font-size: 11px; cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: background .1s, color .1s;
}
.pbChatTitleBtn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.pbChatCloseBtn:hover { background: rgba(255,50,80,0.2); color: #ff4060; }

/* Message area */
.pbChatMessages {
  flex: 1; overflow-y: auto; padding: 12px 10px 6px;
  display: flex; flex-direction: column; gap: 3px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
  background: #0e0e1a;
}
.pbChatDateSep {
  text-align: center; font-size: 10px;
  color: rgba(255,255,255,0.2);
  font-family: 'Rajdhani', system-ui, sans-serif;
  letter-spacing: 1px; margin: 4px 0 8px;
  display: flex; align-items: center; gap: 8px;
}
.pbChatDateSep::before, .pbChatDateSep::after {
  content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.07);
}
.pbChatLoading {
  display: flex; align-items: center; justify-content: center; flex: 1; padding: 20px 0;
}
.pbChatSpinner {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: rgba(130,80,255,0.7);
  animation: pbSpin .7s linear infinite;
  display: inline-block;
}
.pbChatEmpty {
  text-align: center; font-size: 12px; color: rgba(255,255,255,0.25);
  font-family: 'Rajdhani', system-ui, sans-serif; margin: auto; padding: 20px 10px;
}
.pbChatEmpty b { color: rgba(255,255,255,0.4); font-weight: 700; }

/* Bubbles */
.pbChatMsg { display: flex; flex-direction: column; max-width: 80%; }
.pbChatMsgMe   { align-self: flex-end; align-items: flex-end; }
.pbChatMsgThem { align-self: flex-start; align-items: flex-start; }
.pbChatBubble {
  padding: 7px 11px; border-radius: 14px;
  font-family: 'Rajdhani', system-ui, sans-serif;
  font-size: 13px; font-weight: 500; line-height: 1.4; word-break: break-word;
}
.pbChatMsgMe   .pbChatBubble {
  background: #50C9EE; color: #fff;
  border-bottom-right-radius: 4px;
}
.pbChatMsgThem .pbChatBubble {
  background: #EE4B72; color: #fff;
  border-bottom-left-radius: 4px;
}
.pbChatMsgMeta {
  display: flex; align-items: center; gap: 4px;
  margin: 2px 4px 4px;
}
.pbChatMsgTime {
  font-size: 9px; color: rgba(255,255,255,0.2);
  font-family: 'Rajdhani', system-ui, sans-serif;
}
.pbChatMsgStatus {
  font-size: 9px; font-family: 'Rajdhani', system-ui, sans-serif;
  font-weight: 600; letter-spacing: 0.3px;
}
.pbChatStatusSending { color: rgba(255,255,255,0.25); font-style: italic; }
.pbChatStatusSent    { color: rgba(255,255,255,0.3); }
.pbChatStatusDelivered { color: rgba(80,201,238,0.6); }
.pbChatStatusSeen    { color: #50C9EE; }

/* Input row */
.pbChatInputRow {
  display: flex; align-items: center;
  border-top: 1px solid rgba(255,255,255,0.07);
  background: #12121e; flex-shrink: 0; padding: 0;
}
.pbChatInput {
  flex: 1; background: transparent; border: none; outline: none; color: #fff;
  font-family: 'Rajdhani', system-ui, sans-serif;
  font-size: 13px; font-weight: 500; padding: 10px 12px;
}
.pbChatInput::placeholder { color: rgba(255,255,255,0.2); font-style: italic; }
.pbChatSendBtn {
  width: 38px; height: 38px; background: none; border: none; border-left: 1px solid rgba(255,255,255,0.07);
  color: rgba(130,80,255,0.6); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: color .12s, background .12s;
}
.pbChatSendBtn:hover:not(:disabled) { color: #a070ff; background: rgba(130,80,255,0.1); }
.pbChatSendBtn:disabled { opacity: 0.3; cursor: default; }
.pbChatSendBtn svg { width: 14px; height: 14px; }

/* Window enter/leave animation */
.pbChatWin-enter-active, .pbChatWin-leave-active { transition: opacity .18s, transform .18s; }
.pbChatWin-enter-from, .pbChatWin-leave-to { opacity: 0; transform: translateY(16px); }

.pbFriendStatusDot {
  position: absolute; bottom: 1px; right: 1px;
  width: 9px; height: 9px; border-radius: 50%;
  border: 2px solid #141420;
}
.pbFriendStatusDot.online  { background: #4dff90; }
.pbFriendStatusDot.offline { background: rgba(255,255,255,0.2); }

/* Friend action icon buttons */
.pbFriendActionBtns {
  display: flex; gap: 5px; flex-shrink: 0;
}
.pbFriendActionBtn {
  width: 28px; height: 28px; border-radius: 7px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.45);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s, border-color .12s, transform .1s;
}
.pbFriendActionBtn svg { width: 13px; height: 13px; }
.pbFriendActionBtn:hover {
  background: rgba(255,255,255,0.13);
  color: #fff;
  border-color: rgba(255,255,255,0.22);
}
.pbFriendActionBtn:active { transform: scale(0.88); }
.pbFriendChallengeBtn {
  background: rgba(220,80,255,0.08);
  border-color: rgba(220,80,255,0.22);
  color: #dc50ff;
}
.pbFriendChallengeBtn:hover {
  background: rgba(220,80,255,0.18);
  border-color: rgba(220,80,255,0.4);
  color: #dc50ff;
}
.pbRequestActions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.pbRequestBtn {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .13s, border-color .13s, transform .1s;
}
.pbRequestBtn:active { transform: scale(0.92); }
.pbRequestAccept {
  background: rgba(77,255,144,0.10);
  border-color: rgba(77,255,144,0.28);
  color: #4dff90;
}
.pbRequestAccept:hover {
  background: rgba(77,255,144,0.20);
  border-color: rgba(77,255,144,0.5);
}
.pbRequestDecline {
  background: rgba(255,64,96,0.10);
  border-color: rgba(255,64,96,0.28);
  color: #ff4060;
}
.pbRequestDecline:hover {
  background: rgba(255,64,96,0.20);
  border-color: rgba(255,64,96,0.5);
}

.pbSidebarEmpty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 40px 28px;
}
.pbSidebarEmptyArtSvg { width: 90px; height: 90px; opacity: 0.55; }
.pbSidebarEmptyText {
  font-size: 12px;
  color: rgba(255,255,255,0.38);
  text-align: center;
  line-height: 1.65;
  letter-spacing: 0.3px;
}
.pbSidebarEmptyText b { color: rgba(255,255,255,0.6); }
.pbSidebarEmptyAction {
  background: rgba(220,80,255,0.10);
  border: 1px solid rgba(220,80,255,0.3);
  border-radius: 8px;
  color: #dc50ff;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 9px 18px;
  cursor: pointer;
  font-family: 'Orbitron', system-ui, sans-serif;
  transition: background .14s, border-color .14s;
}
.pbSidebarEmptyAction:hover { background: rgba(220,80,255,0.18); border-color: rgba(220,80,255,0.5); }

/* Sidebar slide transitions */
.pbSidebar-enter-active, .pbSidebar-leave-active,
.pbSidebarRight-enter-active, .pbSidebarRight-leave-active {
  transition: transform .22s cubic-bezier(0.22, 1, 0.36, 1);
}
.pbSidebar-enter-from .pbFriendsSidebar,
.pbSidebar-leave-to   .pbFriendsSidebar  { transform: translateX(-100%); }
.pbSidebar-enter-from .pbNotifSidebar,
.pbSidebar-leave-to   .pbNotifSidebar    { transform: translateX(100%); }

/* Vue Transition on the outer overlay div — we animate the sidebar child directly */
.pbSidebar-enter-from .pbSidebar { transform: translateX(-100%); }
.pbSidebar-leave-to   .pbSidebar { transform: translateX(-100%); }
.pbSidebarRight-enter-from .pbSidebar { transform: translateX(100%); }
.pbSidebarRight-leave-to   .pbSidebar { transform: translateX(100%); }
.pbSidebar-enter-active .pbSidebar,
.pbSidebar-leave-active .pbSidebar,
.pbSidebarRight-enter-active .pbSidebar,
.pbSidebarRight-leave-active .pbSidebar {
  transition: transform .22s cubic-bezier(0.22, 1, 0.36, 1);
}

/* ══════════════════════════════════════════════════════
   PROFILE MODAL
══════════════════════════════════════════════════════ */
.pbProfileOverlay {
  position: fixed;
  inset: 0;
  z-index: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
}
.pbProfileCard {
  background: rgba(14,18,14,0.98);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  width: min(480px, 92vw);
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05);
  position: relative;
}
.pbProfileAccentBar {
  height: 3px;
  background: linear-gradient(90deg, #dc50ff 0%, #6060ff 50%, #00d4ff 100%);
}
.pbProfileHead {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 20px 16px;
}
.pbProfileAvatarBlock {
  position: relative;
  flex-shrink: 0;
}
.pbProfileAvatar {
  width: 64px; height: 64px;
  border-radius: 10px;
  object-fit: cover;
  border: 2px solid rgba(255,255,255,0.14);
  background: rgba(40,40,60,0.8);
  display: block;
}
.pbProfileRankIcon {
  position: absolute;
  bottom: -6px; right: -6px;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.5px;
  padding: 3px 6px;
  border-radius: 5px;
  background: rgba(10,14,10,0.95);
  border: 1px solid rgba(255,255,255,0.14);
  font-family: 'Orbitron', system-ui, sans-serif;
  color: rgba(255,255,255,0.6);
}
.pbProfileMeta {
  flex: 1;
  min-width: 0;
}
.pbProfileName {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 1px;
  font-family: 'Orbitron', system-ui, sans-serif;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.1;
}
.pbProfileFlag { font-size: 16px; }
.pbProfileJoined {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.32);
  margin-top: 4px;
  text-transform: uppercase;
}
.pbProfileUid {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 6px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 6px;
  padding: 3px 9px 3px 7px;
  cursor: pointer;
  font-family: 'Orbitron', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.45);
  transition: background .12s, border-color .12s, color .12s;
}
.pbProfileUid:hover {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.75);
}
.pbProfileUidHash { color: rgba(255,255,255,0.25); margin-right: 1px; }
.pbProfileUidCopyIcon {
  margin-left: 5px;
  font-size: 11px;
  opacity: 0.55;
}
.pbProfileLevelRow {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin-top: 6px;
}
.pbProfileLevel {
  font-size: 20px;
  font-weight: 900;
  color: rgba(255,255,255,0.9);
  font-family: 'Orbitron', system-ui, sans-serif;
}
.pbProfileLevelSlash {
  font-size: 16px;
  font-weight: 700;
  color: rgba(255,255,255,0.35);
  letter-spacing: -2px;
}
.pbProfileClose {
  background: none;
  border: none;
  color: rgba(255,255,255,0.35);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  padding: 6px 0;
  font-family: 'Orbitron', system-ui, sans-serif;
  transition: color .12s;
  flex-shrink: 0;
}
.pbProfileClose:hover { color: #fff; }

/* Stats row */
.pbProfileStats {
  display: flex;
  align-items: center;
  border-top: 1px solid rgba(255,255,255,0.07);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  padding: 14px 20px;
  gap: 0;
}
.pbProfileStat {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 5px;
}
.pbProfileStatVal {
  font-size: 22px;
  font-weight: 900;
  font-family: 'Orbitron', system-ui, sans-serif;
  color: #fff;
}
.pbProfileStatW  { color: #4dff90; }
.pbProfileStatL  { color: #ff4060; }
.pbProfileStatLbl {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.38);
  letter-spacing: 1px;
}
.pbProfileStatDiv {
  width: 1px;
  height: 32px;
  background: rgba(255,255,255,0.08);
  flex-shrink: 0;
}

/* Mode rank rows */
.pbProfileModes {
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.pbProfileModeRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 22px;
  border-bottom: 1px solid rgba(255,255,255,0.045);
  transition: background .12s;
}
.pbProfileModeRow:last-child { border-bottom: none; }
.pbProfileModeRow:hover { background: rgba(255,255,255,0.03); }
.pbProfileModeName {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.4);
  text-transform: uppercase;
  font-family: 'Orbitron', system-ui, sans-serif;
}
.pbProfileModeTier {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-family: 'Orbitron', system-ui, sans-serif;
  padding: 3px 10px;
  border-radius: 5px;
  border: 1px solid transparent;
}
/* Tier colour mappings */
.pbModeTier-unranked  { color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.05);  border-color: rgba(255,255,255,0.08); }
.pbModeTier-plastic   { color: #aab;     background: rgba(170,170,185,0.10); border-color: rgba(170,170,185,0.2); }
.pbModeTier-bronze    { color: #cd7f32;  background: rgba(205,127,50,0.12);  border-color: rgba(205,127,50,0.25); }
.pbModeTier-silver    { color: #c0c0c0;  background: rgba(192,192,192,0.10); border-color: rgba(192,192,192,0.22); }
.pbModeTier-gold      { color: #ffd700;  background: rgba(255,215,0,0.10);   border-color: rgba(255,215,0,0.25); }
.pbModeTier-platinum  { color: #64dcff;  background: rgba(100,220,255,0.10); border-color: rgba(100,220,255,0.22); }
.pbModeTier-diamond   { color: #64a0ff;  background: rgba(100,160,255,0.12); border-color: rgba(100,160,255,0.25); }
.pbModeTier-master    { color: #aa50ff;  background: rgba(170,80,255,0.12);  border-color: rgba(170,80,255,0.28); }
.pbModeTier-champion  { color: #ffd200;  background: rgba(255,210,0,0.14);   border-color: rgba(255,210,0,0.3);  box-shadow: 0 0 8px rgba(255,210,0,0.18); }

/* View profile button */
.pbProfileViewBtn {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.75);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  padding: 18px 20px;
  cursor: pointer;
  font-family: 'Orbitron', system-ui, sans-serif;
  transition: background .14s, color .14s;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.pbProfileViewBtn:hover {
  background: rgba(255,255,255,0.08);
  color: #fff;
}

/* Profile modal transition */
.pbProfileModal-enter-active, .pbProfileModal-leave-active {
  transition: opacity .18s ease, transform .18s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pbProfileModal-enter-from, .pbProfileModal-leave-to {
  opacity: 0;
  transform: scale(0.93);
}


/* ── Main shell ───────────────────────────────────────────────────────────── */
.tetShell{
  width: min(860px, calc(100vw - 24px));
  margin: 0 auto;
  padding: 0 0 120px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Right-anchored shell: covers the right ~75% of the screen + 60px bleed past viewport edge.
   overflow-x:hidden on .main clips the bleed — tiles look flush to the right edge always. */
.tetShellRight{
  width: calc(78vw + 60px);
  margin-left: auto;
  margin-right: -60px;
  padding-right: 0;
}

/* Auth/landing screen: narrower — frees up the left ~58%, logo + tiles on right 42% */
.tetShellAuth{
  width: calc(45vw + 60px);
}

/* Brand/logo aligns with the tile left edge */
.tetShellRight .tetWelcome{
  padding-left: 0;
}


/* ── Welcome brand block ──────────────────────────────────────────────────── */
.tetWelcome{
  padding: 32px 0 22px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.tetBrand{
  display: flex;
  align-items: center;
  gap: 14px;
}
.tetBrandLogo{
  width: clamp(44px, 7vw, 68px);
  height: clamp(44px, 7vw, 68px);
  object-fit: contain;
}
.tetBrandTitle{
  height: clamp(32px, 5vw, 52px);
  width: auto;
  object-fit: contain;
}
.tetBrandWord{
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 1000;
  letter-spacing: 4px;
  text-transform: uppercase;
  line-height: 1;
}
.tetBrandStrong{ opacity: .65; }
.tetWelcomeSub{
  margin-top: 8px;
  font-size: 11px;
  letter-spacing: 4px;
  text-transform: uppercase;
  opacity: .45;
  font-weight: 900;
}


/* ── Row list ─────────────────────────────────────────────────────────────── */
.tetRows{
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-top: 8px;
}
/* In right-anchored shell, no extra left indent needed — shell width positions the tiles */
.tetShellRight .tetRows{
  margin-left: 0;
}


/* ── Single row (the core component) ────────────────────────────────────────
   Inspired by TETR.IO: full-width, left-icon + text, accent colour wash
   ────────────────────────────────────────────────────────────────────────── */
.tetRow{
  --rc: 255,255,255;          /* accent colour (per-variant) */
  --rbg: 22,24,34;            /* base bg */

  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  min-height: clamp(90px, 12vh, 130px);
  border: none;
  border-radius: 0;
  background:
    linear-gradient(90deg,
      rgba(var(--rc), 0.18) 0%,
      rgba(var(--rc), 0.07) 22%,
      rgb(var(--rbg)) 55%,
      rgb(var(--rbg)) 100%);
  cursor: pointer;
  text-align: left;
  padding: 0;
  overflow: hidden;
  transition: filter .18s ease, transform .18s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow .18s ease;

  /* Subtle separator */
  border-bottom: 1px solid rgba(0,0,0,0.35);
}

/* First row: rounded top-left only (right-shell) or full top */
.tetRows > .tetRow:first-child{ border-radius: 10px 10px 0 0; }
/* Last row: rounded bottom, no separator line */
.tetRows > .tetRow:last-child{ border-radius: 0 0 10px 10px; border-bottom: none; }
/* ══════════════════════════════════════════════════════════════════════════
   HOMEPAGE / AUTH SCREEN  (Figma HOMEPAGE kit)
══════════════════════════════════════════════════════════════════════════ */

/* Topbar override on auth screen: show topbar image, hide all text/brand */
/* hpTopbar bg image is applied via Vue inline :style binding on the <header> */
.hpTopbar {
  border-bottom: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

/* Auth screen: fixed between topbar and bottombar — totally independent of document flow */
/* ── Mobile landscape hint banner (auth screen only) ── */
.mobileAuthHint {
  position: fixed;
  bottom: 6.5vw; /* sit just above the bottom bar */
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px 12px 14px;
  border-radius: 40px;
  background: rgba(10, 10, 20, 0.88);
  border: 1px solid rgba(80, 201, 238, 0.45);
  box-shadow: 0 4px 24px rgba(0,0,0,0.55), 0 0 12px rgba(80,201,238,0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  white-space: nowrap;
  pointer-events: all;
  max-width: 90vw;
}
.mobileAuthHintIcon {
  font-size: 20px;
  flex-shrink: 0;
}
.mobileAuthHintText {
  font-size: 18px;
  color: #d0eaf8;
  line-height: 1.3;
  white-space: normal;
}
.mobileAuthHintText strong {
  color: #50c9ee;
}
.mobileAuthHintClose {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #7ab8cc;
  font-size: 22px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.mobileAuthHintClose:hover { color: #fff; }
.mobileHintFade-enter-active { transition: opacity 0.3s ease, transform 0.3s cubic-bezier(.22,1,.36,1); }
.mobileHintFade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.mobileHintFade-enter-from  { opacity: 0; transform: translateX(-50%) translateY(10px); }
.mobileHintFade-leave-to    { opacity: 0; transform: translateX(-50%) translateY(6px); }

.hpAuth {
  position: fixed;
  top: 5.208vw;      /* topbar bottom edge */
  bottom: 5.208vw;   /* bottombar top edge */
  left: 0;
  right: 0;
  z-index: 5;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: clamp(28px, 5vw, 72px);
  background: #050508;
}

/* ── Left column ── */
.hpLeft {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: clamp(260px, 38vw, 520px);
}
.hpVideoWrap {
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,0.55);
  position: relative;
  aspect-ratio: 16 / 9;
}
.hpVideoFrame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 14px;
}
/* Transparent overlay blocks YouTube hover UI */
.hpVideoOverlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: pointer;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition: background 0.2s;
}
.hpVideoOverlay:hover {
  background: rgba(0,0,0,0.18);
}
/* Play button: always visible, slowly thumps */
.hpVideoPlayBtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.hpVideoPlayImg {
  width: clamp(48px, 5.5vw, 80px);
  height: clamp(48px, 5.5vw, 80px);
  object-fit: contain;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,0.7));
  animation: playThump 1.6s ease-in-out infinite;
}
@keyframes playThump {
  0%   { transform: scale(1);    opacity: 0.75; }
  40%  { transform: scale(1.12); opacity: 1;    }
  60%  { transform: scale(1.12); opacity: 1;    }
  100% { transform: scale(1);    opacity: 0.75; }
}
.hpVideoOverlay:hover .hpVideoPlayImg {
  animation: none;
  transform: scale(1.15);
  opacity: 1;
  filter: drop-shadow(0 4px 24px rgba(236,72,128,0.6));
}
.hpVideoPlayLabel {
  font-size: clamp(9px, 0.9vw, 13px);
  font-weight: 900;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 6px rgba(0,0,0,0.8);
  font-family: 'Orbitron', sans-serif;
}
.hpVideoPlaceholder {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 14px;
}
.hpWatchLabel {
  height: clamp(14px, 2vh, 22px);
  width: auto;
  object-fit: contain;
  opacity: 0.85;
}

/* ── Right column ── */
.hpRight {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 0 0 0 clamp(32px, 4vw, 64px);
  min-width: 0;
}

/* Brand block */
.hpBrand {
  display: flex;
  align-items: center;
  gap: clamp(12px, 2vw, 22px);
  margin-bottom: clamp(24px, 4vh, 48px);
}
.hpBrandLogo {
  width: clamp(60px, 9vw, 110px);
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 4px 18px rgba(0,0,0,0.5));
}
.hpBrandText {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hpBrandTitle {
  height: clamp(32px, 5.5vw, 72px);
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 12px rgba(0,0,0,0.45));
}
.hpBrandTagline {
  height: clamp(10px, 1.6vw, 18px);
  width: auto;
  object-fit: contain;
  opacity: 0.75;
}

/* Buttons container — extends past right edge for bleed effect */
.hpBtns {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-right: -60px; /* bleed past viewport right */
  width: calc(100% + 60px); /* fill parent column + bleed amount, works at any viewport width */
  position: relative;
  z-index: 2;
}
.hpBtn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
  width: 100%;
  opacity: 1;
  transition: transform 0.18s cubic-bezier(0.25, 0.8, 0.25, 1),
              filter 0.18s ease;
  transform-origin: left center;
}
.hpBtn:hover {
  transform: translateX(-20px);
  filter: brightness(1.12) saturate(1.1);
}
.hpBtn:active {
  transform: translateX(-10px) scale(0.997);
  filter: brightness(1.05);
}
.hpBtnImg {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 6px 0 0 6px;
  box-shadow: -6px 0 28px rgba(0, 180, 220, 0.12);
}

/* ── Continue button: image bg + text overlay ── */
.hpBtnContinue {
  position: relative;
}
.hpContinueOverlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 17%;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  pointer-events: none;
}
.hpContinueLabel {
  font-size: clamp(18px, 2.8vw, 42px);
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #ffffff;
  line-height: 1;
  text-shadow: 0 2px 12px rgba(0,0,0,0.4);
  text-align: left;
}
.hpContinueName {
  font-size: clamp(9px, 1vw, 14px);
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.65);
  line-height: 1;
  margin-top: 5px;
  text-align: left;
}

/* ── Bottom bar: fixed strip at bottom with author inside ── */
.hpBottomBar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 5.208vw;
  z-index: 12;
  background: var(--hp-bottombar-img) center/cover no-repeat;
  pointer-events: none;
  display: flex;
  align-items: center;
  padding-left: clamp(16px, 2.5vw, 40px);
}
/* ── Author: bottom-left inside the bottom bar ── */
.hpAuthor {
  height: 60%;
  width: auto;
  object-fit: contain;
  pointer-events: none;
}

/* ── Topbar: apply auth_topbar.png as bg, hide all text ── */
/* CSS variable --hp-topbar-img is set via Vue inline :style on the header element */
.hpTopbar .brand,
.hpTopbar .tetBarLeft,
.hpTopbar .tetBarRight,
.hpTopbar .right {
  visibility: hidden;
  pointer-events: none;
}
/* Use CSS var so background image works even against .tetBar's !important background shorthand */
.hpTopbar.tetBar {
  background: var(--hp-topbar-img, #050508) center/cover no-repeat !important;
  border-bottom: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
  /* Asset is 1920×100px — match exact aspect ratio */
  height: 5.208vw !important;
  padding: 0 !important;
}
.hpTopbar:not(.tetBar) {
  background: var(--hp-topbar-img, #050508) center/cover no-repeat !important;
  border-bottom: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
  height: 5.208vw !important;
  padding: 0 !important;
}



/* ══════════════════════════════════════════════════════════════════════════
   MAIN MENU SCREEN  (Figma MENU kit)
══════════════════════════════════════════════════════════════════════════ */

/* ── VERSUS AI (story screen) topbar & bottombar overrides ── */
.vsaiTopbarBar.tetBar {
  background: var(--vsai-topbar-img, #03070f) center/cover no-repeat !important;
  border-bottom: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
  height: 5.208vw !important;
  padding: 0 !important;
}
/* Remove ALL .main padding for story screen so vsaiShell fills
   the exact pixel space between topbar and bottombar — no gaps */
.main:has(.vsaiShell) {
  padding: 0 !important;
}
/* Keep tetBarLeft visible but hide the topbar BACK (we use vsaiBackBtn instead) */
.vsaiTopbarBar .tetBarLeft {
  visibility: visible;
  pointer-events: auto;
  padding-left: clamp(12px, 2vw, 32px);
}
/* Hide the topbar back button — vsaiBackBtn replaces it */
.vsaiTopbarBar .tetBackBtn { display: none !important; }
/* Hide the page title text (image has it) */
.vsaiTopbarBar .tetBarTitle { display: none; }
.vsaiTopbarBar .tetBarRight {
  visibility: visible;
  pointer-events: auto;
  padding-right: clamp(12px, 2vw, 32px);
}

/* Back button styled like menu subScreenBackBtn — fully opaque */
.vsaiBackBtn {
  position: absolute;
  top: 10px;
  left: clamp(16px, 2.5vw, 40px);
  background: #16181f;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 8px;
  color: rgba(255,255,255,0.9);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 7px 16px;
  cursor: pointer;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  transition: background .12s, color .12s, border-color .12s;
  z-index: 20;
}
.vsaiBackBtn:hover {
  background: #22243a;
  color: #fff;
  border-color: rgba(255,255,255,0.32);
}
.vsaiBottomBarBar {
  background: var(--vsai-bottombar-img, #03070f) center/cover no-repeat !important;
  border-top: none !important;
  backdrop-filter: none !important;
  height: 5.208vw !important;
}
.vsaiBottomBarBar .tetBottomText { display: none; }
.vsaiBottomBarBar .tetBottomRight { display: none; }

/* Topbar override on mode screen: apply menu_topbar.png, hide title text (it's in the image), keep user info */
.mnTopbar.tetBar {
  background: var(--mn-topbar-img, #050508) center/cover no-repeat !important;
  border-bottom: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
  height: 5.208vw !important;
  padding: 0 !important;
}
.mnTopbar .tetBarLeft {
  visibility: hidden;
  pointer-events: none;
}
.mnTopbar .tetBarRight {
  visibility: visible;
  pointer-events: auto;
  padding-right: clamp(12px, 2vw, 32px);
}

/* Bottombar override on mode screen: apply menu_bottombar.png */
.mnBottomBar {
  background: var(--mn-bottombar-img, #1a0a14) center/cover no-repeat !important;
  border-top: none !important;
  backdrop-filter: none !important;
  height: 5.208vw !important;
}
.mnBottomBar .tetBottomText {
  opacity: 1;
  font-size: clamp(9px, 1vw, 13px);
  letter-spacing: 2.5px;
  color: rgba(255,255,255,0.9);
  padding-left: clamp(12px, 2vw, 32px);
}
.mnBottomBar .tetBottomRight {
  padding-right: clamp(12px, 2vw, 32px);
}
.mnBottomAuthor {
  height: clamp(18px, 3.125vw, 52px); /* ≈ 60% of the 5.208vw bottombar */
  width: auto;
  object-fit: contain;
  opacity: 0.85;
  pointer-events: none;
}

/* ══════════════════════════════════════════════════════════════════════════
   SETTINGS / CREDITS SCREENS  (Figma SETTINGS & CREDITS kit)
══════════════════════════════════════════════════════════════════════════ */
.stTopbar.tetBar {
  background: var(--st-topbar-img, #2a2a2a) center/cover no-repeat !important;
  border-bottom: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
  height: 5.208vw !important;
  min-height: 5.208vw !important;
  max-height: 5.208vw !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  overflow: hidden !important;
}
.stTopbar .tetBarLeft {
  padding-left: clamp(16px, 2.5vw, 40px);
  display: flex;
  align-items: center;
  gap: 12px;
}
.stBottomBar {
  background: var(--st-bottombar-img, #111) center/cover no-repeat !important;
  border-top: none !important;
  backdrop-filter: none !important;
  height: 5.208vw !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}
.stBottomBar .tetBottomText {
  opacity: 1;
  font-size: clamp(9px, 1vw, 13px);
  letter-spacing: 2.5px;
  color: rgba(255,255,255,0.9);
  padding-left: clamp(16px, 2.5vw, 40px);
}
.stBottomBar .tetBottomRight {
  padding-right: clamp(16px, 2.5vw, 40px);
}

/* PNG title image inside topbar (settings / credits / lobby) */
.tetBarTitlePng {
  height: 2.6vw;
  max-height: 70%;
  width: auto;
  object-fit: contain;
  pointer-events: none;
  display: block;
  flex-shrink: 0;
}
.settingsScreen .vsStyleTitle,
.creditsScreen .vsStyleTitle {
  background: linear-gradient(90deg, #ffffff 0%, #d0d0d0 50%, #a0a0a0 100%) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
}
.settingsScreen .vsStyleHeaderGlow,
.creditsScreen .vsStyleHeaderGlow {
  background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(200,200,200,0.12), transparent 70%);
}
.settingsScreen .vsStyleCheck,
.settingsScreen .vsStyleSlider {
  accent-color: rgba(180,180,180,0.95);
}
.settingsScreen .vsStyleCard::before,
.creditsScreen .vsStyleCard::before {
  background: radial-gradient(ellipse 120% 200% at 0% 50%, rgba(160,160,160,0.05), transparent 60%);
}

/* ══════════════════════════════════════════════════════════════════════════
   LOBBY SCREEN  (Figma LOBBY kit)
══════════════════════════════════════════════════════════════════════════ */
.lbTopbar.tetBar {
  background: var(--lb-topbar-img, #3d1b6e) center/cover no-repeat !important;
  border-bottom: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
  height: 5.208vw !important;
  min-height: 5.208vw !important;
  max-height: 5.208vw !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  overflow: hidden !important;
}
.lbTopbar .tetBarLeft {
  padding-left: clamp(16px, 2.5vw, 40px);
  display: flex;
  align-items: center;
  gap: 12px;
}
.lbBottomBar {
  background: var(--lb-bottombar-img, #3d1b6e) center/cover no-repeat !important;
  border-top: none !important;
  backdrop-filter: none !important;
  height: 5.208vw !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}
.lbBottomBar .tetBottomText {
  opacity: 1;
  font-size: clamp(9px, 1vw, 13px);
  letter-spacing: 2.5px;
  color: rgba(255,255,255,0.9);
  padding-left: clamp(16px, 2.5vw, 40px);
}
.lbBottomBar .tetBottomRight {
  padding-right: clamp(16px, 2.5vw, 40px);
}

/* Lobby: purple-tinted content */
.lobbyScreen .vsStyleTitle {
  background: linear-gradient(90deg, #c084fc 0%, #a855f7 40%, #7c3aed 100%) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
}
.lobbyScreen .vsStyleHeaderGlow {
  background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(139,92,246,0.22), transparent 70%);
}
.lobbyScreen .pbCard {
  background: rgba(80, 40, 140, 0.15) !important;
  border-color: rgba(139,92,246,0.22) !important;
}
.lobbyScreen .pbCard::before {
  background: radial-gradient(ellipse 120% 200% at 0% 50%, rgba(139,92,246,0.07), transparent 60%);
}
.lobbyScreen .pbTitle {
  color: rgba(196, 148, 255, 1) !important;
}
.lobbyScreen .pbHint {
  color: rgba(180, 130, 255, 0.6) !important;
}
.lobbyScreen .pbInput {
  border-color: rgba(139,92,246,0.35) !important;
  background: rgba(60, 20, 100, 0.3) !important;
}
.lobbyScreen .pbInput:focus {
  border-color: rgba(168,85,247,0.65) !important;
  outline-color: rgba(168,85,247,0.3) !important;
}
.lobbyScreen .pbDivider {
  background: rgba(139,92,246,0.18) !important;
}
.lobbyScreen .pbMiniBtn.primary {
  background: linear-gradient(135deg, rgba(109,40,217,0.85), rgba(139,92,246,0.85)) !important;
  border-color: rgba(168,85,247,0.4) !important;
}
.lobbyScreen .pbMiniBtn.primary:hover {
  background: linear-gradient(135deg, rgba(124,58,237,0.95), rgba(167,139,250,0.9)) !important;
}

/* Logo + title in bottombar LEFT for settings/credits/lobby */
.scBottomLeft {
  display: flex;
  align-items: center;
  gap: clamp(4px, 0.6vw, 10px);
  padding-left: clamp(16px, 2.5vw, 40px);
}
.scBottomLogo {
  height: clamp(20px, 3.2vw, 54px);
  width: auto;
  object-fit: contain;
  pointer-events: none;
}
.scBottomTitle {
  height: clamp(12px, 2vw, 34px);
  width: auto;
  object-fit: contain;
  pointer-events: none;
}
.scBottomText {
  padding-left: 0 !important;
  padding-right: clamp(16px, 2.5vw, 40px);
}

/* Mode screen: fixed layout between topbar and bottombar */
.app.hasBottomBar:has(.mnMenu) {
  padding-bottom: 0;
}
.mnMenu {
  position: fixed;
  top: 5.208vw;
  bottom: 5.208vw;
  left: 0;
  right: 0;
  z-index: 5;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  background: #050508;
  padding-left: clamp(28px, 5vw, 72px);
}

/* ── Left column: empty space, brand anchored to bottom ── */
.mnLeft {
  flex: 0 0 clamp(260px, 56vw, 840px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: clamp(20px, 4vh, 52px);
}

.mnBrand {
  display: flex;
  align-items: center;
  gap: clamp(16px, 2.2vw, 34px);
}

.mnBrandLogo {
  width: clamp(80px, 9vw, 140px);
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 4px 24px rgba(0,0,0,0.6));
}

.mnBrandTitle {
  height: clamp(36px, 5.5vw, 82px);
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 12px rgba(0,0,0,0.45));
}

/* ── Right column: buttons, vertically centered, bleed past right edge ── */
.mnRight {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-width: 0;
  position: relative;
  clip-path: inset(0 0 0 -200px);
}

/* Stable-width wrapper so Transition never collapses width during out-in */
.mnSlideWrap {
  width: 100%;
  clip-path: inset(0 0 0 -200px);
}

/* Mode picker label */
.mnPickerLabel {
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  font-size: clamp(9px, 0.85vw, 13px);
  font-weight: 900;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  padding-left: 4px;
  margin-bottom: clamp(6px, 0.8vh, 10px);
}

/* Slide transition — exits/enters from right, pure translate */
.mn-slide-leave-active { transition: transform 0.22s cubic-bezier(0.55, 0, 1, 0.45); }
.mn-slide-enter-active { transition: transform 0.26s cubic-bezier(0.25, 0.8, 0.25, 1); }
.mn-slide-leave-to   { transform: translateX(120%); }
.mn-slide-enter-from { transform: translateX(120%); }
.mn-slide-leave-from, .mn-slide-enter-to { transform: translateX(0); }

/* Buttons container — extends past right edge for bleed effect */
.mnBtns {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.2vh, 14px);
  margin-right: -60px;
  width: calc(100% + 60px); /* fill parent column + bleed amount, works at any viewport width */
  position: relative;
  z-index: 2;
}

.mnBtn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
  width: 100%;
  opacity: 1;
  transition: transform 0.18s cubic-bezier(0.25, 0.8, 0.25, 1),
              filter 0.18s ease;
  transform-origin: left center;
}
.mnBtn:hover {
  transform: translateX(-20px);
  filter: brightness(1.12) saturate(1.1);
}
.mnBtn:active {
  transform: translateX(-10px) scale(0.997);
  filter: brightness(1.05);
}
.mnBtnImg {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 6px 0 0 6px;
  box-shadow: -6px 0 28px rgba(0, 0, 0, 0.25);
}

/* Text-only variant of mnBtn — no image asset required */
.mnBtnText {
  background: #16181f;
  border: 1px solid rgba(255,255,255,0.10);
  border-right: none;
  padding: 0 22px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  height: 64px;
  border-radius: 6px 0 0 6px;
  box-shadow: -6px 0 28px rgba(0,0,0,0.22);
  transform-origin: left center;
  transition: transform 0.18s cubic-bezier(0.25,0.8,0.25,1),
              filter 0.18s ease,
              background 0.18s ease,
              border-color 0.18s ease;
}
.mnBtnText:hover {
  transform: translateX(-20px);
  filter: brightness(1.12) saturate(1.1);
  background: #22243a;
  border-color: rgba(255,255,255,0.20);
}
.mnBtnText:active {
  transform: translateX(-10px) scale(0.997);
  filter: brightness(1.05);
}
.mnBtnTextLabel {
  font-family: "Orbitron", sans-serif;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.90);
  line-height: 1;
}
.mnBtnTextSub {
  font-family: "Orbitron", sans-serif;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.38);
  margin-top: 5px;
  line-height: 1;
}


/* ─── Quick Play Mode Picker ────────────────────────────────── */
.qmPickerPanel {
  width: min(400px, 100%);
  padding: 20px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.qmPickerPanel::-webkit-scrollbar { display: none; }
.qmPickerTitle {
  font-family: "Orbitron", sans-serif;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.5);
  margin-bottom: 2px;
}
.qmPickerCards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qmPickerCard.vsStyleCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 12px;
  background: #1e2030;
  border-color: rgba(255,255,255,0.14);
  cursor: pointer;
  transition: background .18s, border-color .18s, box-shadow .18s;
}
.qmPickerCard.vsStyleCard:hover {
  background: #252840;
  border-color: rgba(99,210,255,0.35);
  box-shadow: 0 0 18px rgba(99,210,255,0.08);
}
.qmPickerDesc {
  font-size: 10px;
  letter-spacing: 1.2px;
  color: rgba(255,255,255,0.40);
  font-family: "Orbitron", sans-serif;
  text-transform: uppercase;
  line-height: 1.4;
}
.qmPickerBtn {
  align-self: flex-start;
  margin-top: 6px;
}
.qmPickerBack {
  align-self: flex-start;
  margin-top: 2px;
}

/* ─── Lobby Mode Pills ──────────────────────────────────────── */
.lobbyModePills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.mhFilterTab.active.lobbyModeActive,
.lobbyModePills .mhFilterTab.active {
  border-color: rgba(99,210,255,0.45);
  background: rgba(99,210,255,0.10);
  color: #63d2ff;
}

/* ─── Lobby Mode Badges ─────────────────────────────────────── */
.lobbyModeBadge {
  display: inline-block;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1.5px;
  border-radius: 4px;
  padding: 2px 5px;
  vertical-align: middle;
  margin-left: 6px;
  font-family: "Orbitron", sans-serif;
  line-height: 1.3;
}
.badgeMW {
  background: rgba(0,210,210,0.15);
  border: 1px solid rgba(0,210,210,0.40);
  color: #00d2d2;
}
.badgeBD {
  background: rgba(160,80,255,0.15);
  border: 1px solid rgba(160,80,255,0.40);
  color: #c084ff;
}

/* ─── Lobby form mode field ─────────────────────────────────── */
.pbField .lobbyModePills {
  margin-top: 6px;
}


/* Override for right-shell: tiles flush to right edge */
.tetShellRight .tetRows > .tetRow{ border-radius: 0; }
.tetShellRight .tetRows > .tetRow:first-child{ border-radius: 10px 0 0 0; }
.tetShellRight .tetRows > .tetRow:last-child{ border-radius: 0 0 0 10px; border-bottom: none; }
.tetShellRight .tetRows > .tetRow:only-child{ border-radius: 10px 0 0 10px; }

.tetRow:hover{
  filter: brightness(1.18) saturate(1.2);
  transform: translateX(-20px);
  z-index: 1;
  box-shadow: -6px 0 28px rgba(var(--rc), 0.18);
}
.tetRow:active{
  transform: translateX(-10px) scale(0.997);
  filter: brightness(1.08) saturate(1.1);
}
.tetRow.tetRowLocked{
  filter: grayscale(0.4);
  opacity: .7;
}
.tetRow.tetRowLocked:hover{
  filter: grayscale(0.2) brightness(1.05);
  transform: translateX(-8px);
  box-shadow: none;
}


/* ── Glyph column (left icon/text) ───────────────────────────────────────── */
.tetRowGlyph{
  flex-shrink: 0;
  width: clamp(100px, 14vw, 150px);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(26px, 4vw, 40px);
  font-weight: 1000;
  letter-spacing: 1px;
  color: rgba(var(--rc), 0.9);
  text-shadow: 0 0 20px rgba(var(--rc), 0.4);
  background: linear-gradient(90deg, rgba(var(--rc),0.14), rgba(var(--rc),0.04));
  border-right: 1px solid rgba(var(--rc), 0.12);
  min-height: clamp(90px, 12vh, 130px);
}
.tetGlyphPng{
  width: clamp(52px, 8vw, 84px);
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(var(--rc), 0.35));
}
.tetGlyphText{
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  font-size: clamp(22px, 3.5vw, 36px);
  font-weight: 1000;
  letter-spacing: 2px;
  color: rgba(var(--rc), 0.88);
}
.tetGlyphBig{ font-size: clamp(24px, 4vw, 38px); }


/* ── Text body ───────────────────────────────────────────────────────────── */
.tetRowBody{
  flex: 1;
  padding: clamp(16px,2.5vh,28px) clamp(18px,2.5vw,30px);
  min-width: 0;
}
.tetRowTitle{
  font-size: clamp(20px, 3.8vh, 34px);
  font-weight: 1000;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  line-height: 1.1;
  color: rgba(var(--rc), 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tetTextPng{
  height: clamp(18px, 3.2vh, 32px);
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(var(--rc),0.3));
}
.tetRowSub{
  margin-top: 4px;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: .55;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}


/* ── Right badge / lock ──────────────────────────────────────────────────── */
.tetRowBadge{
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  min-width: 70px;
  gap: 2px;
}
.tetBadgeNum{
  font-size: clamp(20px, 3.5vh, 30px);
  font-weight: 1000;
  letter-spacing: 1px;
  color: rgba(var(--rc), 0.9);
  line-height: 1;
}
.tetBadgeLabel{
  font-size: 9px;
  letter-spacing: 2px;
  font-weight: 900;
  text-transform: uppercase;
  opacity: .55;
}
.tetRowBadgeTier .tetBadgeNum{ font-size: clamp(14px, 2.2vh, 20px); }
.tetRowBadgeWins .tetBadgeNum{ color: #4dff90; }
.tetRowLock{
  padding: 0 22px;
  font-size: 22px;
  opacity: .45;
  flex-shrink: 0;
}


/* ── Accent colour variants ──────────────────────────────────────────────── */
.tetRowRed    { --rc: 255, 80, 100;   --rbg: 28, 14, 18; }
.tetRowOrange { --rc: 255, 140, 50;   --rbg: 28, 18, 10; }
.tetRowYellow { --rc: 255, 210, 60;   --rbg: 26, 22, 8;  }
.tetRowGreen  { --rc: 60, 220, 120;   --rbg: 10, 24, 16; }
.tetRowBlue   { --rc: 80, 170, 255;   --rbg: 10, 16, 28; }
.tetRowCyan   { --rc: 0, 220, 240;    --rbg: 6, 22, 26;  }
.tetRowPurple { --rc: 180, 100, 255;  --rbg: 18, 10, 28; }
.tetRowPeach  { --rc: 255, 170, 120;  --rbg: 28, 16, 10; }
.tetRowDanger { --rc: 255, 64, 96;    --rbg: 28, 8, 12;  }
.tetRowMuted  { --rc: 180, 190, 210;  --rbg: 18, 20, 26; }


/* ── Online dot (welcome / channel) ─────────────────────────────────────── */
.tetOnlineDot{
  display: inline-block;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #4dff90, #00c864);
  box-shadow: 0 0 18px rgba(77,255,144,0.7), 0 0 32px rgba(77,255,144,0.35);
  animation: tetPulse 2s ease-in-out infinite;
}
@keyframes tetPulse{
  0%,100%{ box-shadow: 0 0 18px rgba(77,255,144,0.7), 0 0 32px rgba(77,255,144,0.35); }
  50%{ box-shadow: 0 0 28px rgba(77,255,144,0.95), 0 0 48px rgba(77,255,144,0.5); }
}
.tetMemberName{ color: #4dff90; font-weight: 900; }


/* ── Bottom status bar ───────────────────────────────────────────────────── */
.tetBottomBar{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 38px;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(4,4,10,0.88);
  border-top: 1px solid rgba(255,255,255,0.07);
  backdrop-filter: blur(10px);
}
.tetBottomText{
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: .65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.tetBottomRight{
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-left: 14px;
}
.tetBottomLogo{
  width: 22px; height: 22px;
  object-fit: contain;
  opacity: .5;
}
.tetBottomMadeBy{
  height: 18px;
  width: auto;
  object-fit: contain;
  opacity: .4;
}
.tetBottomMadeByText{
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: .4;
}


/* ── Responsive tweaks ───────────────────────────────────────────────────── */
@media (max-width: 600px){
  .tetRowGlyph{ width: 72px; min-height: 80px; font-size: 22px; }
  .tetRow{ min-height: 80px; }
  .tetRowTitle{ font-size: 17px; letter-spacing: 1.5px; }
  .tetRowSub{ font-size: 10px; letter-spacing: 1.2px; }
  .tetBadgeNum{ font-size: 18px; }
  .tetShellRight{ width: calc(90vw + 60px); }
}
@media (max-height: 600px){
  .tetRow{ min-height: 70px; }
  .tetRowGlyph{ min-height: 70px; }
  .tetShell{ padding-bottom: 50px; }
}

/* ============================================================
   MATCH HISTORY
============================================================ */

.mhPanel {
  width: min(640px, 100%);
}

.mhHeaderGlow {
  background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(255,100,80,0.20), rgba(0,229,255,0.10) 50%, transparent 70%) !important;
}

/* Profile card shortcut */
.mhProfileCard {
  transition: border-color .2s, transform .15s !important;
}
.mhProfileCard:hover {
  border-color: rgba(255,255,255,0.22) !important;
  transform: translateY(-1px);
}
.mhProfileRow {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 6px 0 4px;
}
.mhProfileStat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
}
.mhProfileNum {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 1px;
  line-height: 1;
}
.mhProfileNum.mhWin   { color: #3dffa0; }
.mhProfileNum.mhLoss  { color: #ff5f5f; }
.mhProfileLbl {
  font-size: 9px;
  letter-spacing: 2px;
  font-weight: 900;
  opacity: .40;
  text-transform: uppercase;
}
.mhProfileDivider {
  width: 1px;
  height: 32px;
  background: rgba(255,255,255,0.10);
}
.mhProfileArrow {
  font-size: 9px;
  letter-spacing: 2px;
  font-weight: 900;
  opacity: .35;
  margin-left: 8px;
  align-self: center;
}

/* ── Ranked profile card ─────────────────────────────────────────────────── */
.pbRankedCard { display: flex; flex-direction: column; gap: 8px; }

.pbTierBadge {
  display: inline-block;
  align-self: flex-start;
  padding: 3px 12px;
  border-radius: 20px;
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: #333;
  color: #ccc;
  border: 1.5px solid #555;
}

/* ── Tier badge colours ── */
.pbTier-unranked  { background: #1a1a1a; color: #555;    border-color: #2a2a2a; }
.pbTier-plastic   { background: #1a1a2e; color: #7b8cbf; border-color: #3a3f6e; }
.pbTier-wood      { background: #2b1d0e; color: #b8864a; border-color: #6b4420; }
.pbTier-bronze    { background: #2a1206; color: #d4824a; border-color: #8c4418; }
.pbTier-silver    { background: #181820; color: #b8c4d8; border-color: #6878a0; }
.pbTier-gold      { background: #221900; color: #f0c830; border-color: #b88a00; }
.pbTier-platinum  { background: #091c1c; color: #38d8c8; border-color: #187870; }
.pbTier-diamond   { background: #0c0c24; color: #80b8ff; border-color: #4068c8; }
.pbTier-master    { background: #1a0824; color: #d080ff; border-color: #8030c0; }
.pbTier-champion  {
  background: linear-gradient(135deg, #1a0808 0%, #280a00 50%, #1a1200 100%);
  color: #ffd700;
  border-color: #cc8800;
  box-shadow: 0 0 8px 1px rgba(255,200,0,0.25);
}

/* ── LP row ── */
.pbLpRow {
  display: flex; align-items: baseline; gap: 6px;
  font-family: 'Orbitron', sans-serif;
}
.pbLpLabel { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; }
.pbLpValue { font-size: 22px; font-weight: 800; color: #e8e8e8; }
.pbLpPeak  { font-size: 10px; color: #666; margin-left: auto; }

/* ── LP bar ── */
.pbLpBarTrack {
  width: 100%; height: 6px;
  background: #1e1e1e; border-radius: 4px; overflow: hidden;
}
.pbLpBarFill {
  height: 100%; border-radius: 4px;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  background: #444;
}
.pbTierFill-placing   { background: linear-gradient(90deg, #3a3f6e, #7b8cbf); }
.pbTierFill-plastic   { background: linear-gradient(90deg, #3a3f6e, #7b8cbf); }
.pbTierFill-wood      { background: linear-gradient(90deg, #6b4420, #b8864a); }
.pbTierFill-bronze    { background: linear-gradient(90deg, #8c4418, #d4824a); }
.pbTierFill-silver    { background: linear-gradient(90deg, #6878a0, #b8c4d8); }
.pbTierFill-gold      { background: linear-gradient(90deg, #b88a00, #f0c830); }
.pbTierFill-platinum  { background: linear-gradient(90deg, #187870, #38d8c8); }
.pbTierFill-diamond   { background: linear-gradient(90deg, #4068c8, #80b8ff); }
.pbTierFill-master    { background: linear-gradient(90deg, #8030c0, #d080ff); }
.pbTierFill-champion  { background: linear-gradient(90deg, #cc8800, #ffd700, #ffec80); }

/* ── Streak / shield badges ── */
.pbBadgeRow { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.pbStreakBadge,
.pbShieldBadge {
  font-size: 11px;
  font-family: 'Orbitron', sans-serif;
  padding: 2px 8px;
  border-radius: 10px;
  letter-spacing: 0.04em;
}
.pbStreakBadge { background: rgba(255,120,0,0.15); color: #ff9040; border: 1px solid rgba(255,120,0,0.3); }
.pbShieldBadge { background: rgba(80,180,255,0.12); color: #70c0ff; border: 1px solid rgba(80,180,255,0.3); }

/* ── Placement state ── */
.pbPlacementRow {
  display: flex; justify-content: space-between; align-items: center;
  font-family: 'Orbitron', sans-serif; font-size: 11px; color: #888;
}
.pbPlacementVal { color: #ccc; font-weight: 700; }
.pbPlacementHint { font-size: 10px; color: #555; line-height: 1.4; }

/* ── Ranked record line ── */
.pbRankedRecord {
  font-size: 12px; color: #888;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.04em;
  display: flex; gap: 4px; align-items: center;
}
.pbRankedW   { color: #3dffa0; }
.pbRankedL   { color: #ff5f5f; }
.pbRankedWr  { color: #aaa; }

/* Filter bar */
.mhFilterBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.mhFilterTabs {
  display: flex;
  gap: 4px;
}
.mhFilterTab {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.45);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.mhFilterTab:hover {
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.75);
  border-color: rgba(255,255,255,0.18);
}
.mhFilterTab.active {
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.25);
  color: #fff;
}
.mhPageInfo {
  font-size: 10px;
  letter-spacing: 1.5px;
  opacity: .35;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Skeleton loading */
.mhSkeletonList {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mhSkeleton {
  height: 62px;
  border-radius: 12px;
  background: linear-gradient(90deg,
    rgba(255,255,255,0.04) 0%,
    rgba(255,255,255,0.08) 50%,
    rgba(255,255,255,0.04) 100%
  );
  background-size: 200% 100%;
  animation: mhShimmer 1.4s ease-in-out infinite;
}
@keyframes mhShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* Empty state */
.mhEmpty {
  text-align: center;
  padding: 36px 18px !important;
}
.mhEmptyIcon {
  font-size: 36px;
  margin-bottom: 10px;
}
.mhEmptyTitle {
  font-size: 11px;
  letter-spacing: 3px;
  font-weight: 900;
  opacity: .5;
  margin-bottom: 4px;
}

/* Match list */
.mhList {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mhCard {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  overflow: hidden;
  cursor: pointer;
  transition: border-color .18s, background .18s, transform .12s;
}
.mhCard:hover {
  border-color: rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.05);
  transform: translateX(2px);
}
.mhCard.win  { border-left: 3px solid rgba(61,255,160,0.50); }
.mhCard.loss { border-left: 3px solid rgba(255,95,95,0.50); }
.mhCard.draw { border-left: 3px solid rgba(255,255,255,0.20); }
.mhCard.expanded {
  border-color: rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.05);
}

.mhCardMain {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

/* W/L/D badge */
.mhResultBadge {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 1000;
  letter-spacing: 1px;
  flex-shrink: 0;
}
.mhResultBadge.w {
  background: rgba(61,255,160,0.14);
  color: #3dffa0;
  border: 1px solid rgba(61,255,160,0.25);
}
.mhResultBadge.l {
  background: rgba(255,95,95,0.12);
  color: #ff6b6b;
  border: 1px solid rgba(255,95,95,0.22);
}
.mhResultBadge.d {
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.12);
}

.mhCardBody {
  flex: 1;
  min-width: 0;
}
.mhCardOpponent {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255,255,255,0.85);
}
.mhOppName {
  color: #fff;
}
.mhCardMeta {
  font-size: 10px;
  letter-spacing: .8px;
  color: rgba(255,255,255,0.35);
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.mhMetaDot { opacity: .25; }
.mhMetaTag {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.mhMetaTag.er-timeout   { color: #ffb347; }
.mhMetaTag.er-surrender { color: #aaa; }
.mhMetaTag.er-abandoned { color: #888; }
.mhMetaTag.er-normal    { color: rgba(255,255,255,0.45); }

.mhCardChevron {
  font-size: 20px;
  opacity: .25;
  transition: transform .2s, opacity .2s;
  flex-shrink: 0;
}
.mhCardChevron.open {
  transform: rotate(90deg);
  opacity: .6;
}

/* Expanded detail */
.mhExpandedBody {
  padding: 0 14px 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  animation: mhExpandIn .18s cubic-bezier(.22,1,.36,1);
}
@keyframes mhExpandIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.mhExpandGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding-top: 12px;
}
.mhExpandCell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mhExpandLabel {
  font-size: 9px;
  letter-spacing: 2px;
  font-weight: 900;
  opacity: .35;
  text-transform: uppercase;
}
.mhExpandVal {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .5px;
  color: rgba(255,255,255,0.80);
}
.mhWinTxt  { color: #3dffa0 !important; }
.mhLossTxt { color: #ff6b6b !important; }


/* Pagination */
.mhPagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
}
.mhPageBtn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.60);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s, opacity .15s;
}
.mhPageBtn:hover:not(:disabled) {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.22);
  color: #fff;
}
.mhPageBtn:disabled {
  opacity: .25;
  cursor: default;
}
.mhPageDots {
  display: flex;
  gap: 5px;
  align-items: center;
}
.mhPageDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255,255,255,0.18);
  cursor: pointer;
  transition: background .15s, transform .15s;
}
.mhPageDot.active {
  background: rgba(255,255,255,0.75);
  transform: scale(1.25);
}
.mhPageDot:hover:not(.active) {
  background: rgba(255,255,255,0.38);
}

/* Mobile tweaks */
@media (max-width: 480px) {
  .mhExpandGrid { grid-template-columns: repeat(2, 1fr); }
  .mhFilterTab  { padding: 7px 10px; font-size: 9px; }
  .mhCardMeta   { font-size: 9px; }
}

/* ═══════════════════════════════════════════════════════
   LANDING SCREEN  –  pre-auth splash with floating pieces
═══════════════════════════════════════════════════════ */
.landingScreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #050508;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Floating piece background ── */
.landingBg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Menu screens ambient pentomino layer */
.menuPentoBg {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}

/* Injected inside solid-background sections (.mnMenu, .hpAuth) */
.sectionPentoBg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.floatingPieceWrap {
  position: absolute;
}

.floatingPieceAnim {
  /* animation now handled by JS physics loop */
}

@keyframes pentominoFloat {
  0%   { transform: translateY(0px)   rotate(0deg); }
  25%  { transform: translateY(-18px) rotate(4deg); }
  50%  { transform: translateY(-8px)  rotate(-3deg); }
  75%  { transform: translateY(-22px) rotate(2deg); }
  100% { transform: translateY(0px)   rotate(0deg); }
}

/* ── Center branding ── */
.landingCenter {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  animation: landingFadeIn 1.2s ease both;
}

@keyframes landingFadeIn {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

.landingLogo {
  width: clamp(80px, 12vw, 160px);
  height: auto;
  margin-bottom: 16px;
}

.landingTitle {
  width: clamp(220px, 38vw, 520px);
  height: auto;
  margin-bottom: 12px;
}

.landingAuthor {
  height: clamp(24px, 3vw, 42px);
  width: auto;
  opacity: 1;
  margin-bottom: 36px;
}

/* ── CLICK START button ── */
.landingStartBtn {
  position: relative;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  outline: none;
  animation: blinkStart 1.6s ease-in-out infinite;
}

.landingStartBtnText {
  display: block;
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(13px, 1.8vw, 18px);
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.90);
  background: #16181f;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 16px 48px;
  transition: background 0.18s ease, border-color 0.18s ease, filter 0.18s ease;
}

.landingStartBtn:hover .landingStartBtnText {
  background: #22243a;
  border-color: rgba(255, 255, 255, 0.25);
  filter: brightness(1.15);
}

.landingStartBtn:active .landingStartBtnText {
  filter: brightness(0.9);
}

@keyframes blinkStart {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* ── Vignette overlay ── */
.landingVignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background:
    radial-gradient(ellipse at center, transparent 30%, rgba(5, 5, 8, 0.7) 100%),
    linear-gradient(to bottom, rgba(5,5,8,0.4) 0%, transparent 20%, transparent 80%, rgba(5,5,8,0.4) 100%);
}

/* ══ STORY TAUNT BUBBLE ══════════════════════════════════════════════════ */
.storyTauntWrap {
  position: absolute;
  top: 110px;
  left: 14px;
  width: min(320px, calc(420px - 28px));
  padding-top: 12px;
  z-index: 500;
  pointer-events: none;
}

/* Tail pointing UP toward IS PICKING / IS THINKING */
.storyTauntTail {
  position: absolute;
  top: 0px;
  left: 28px;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 13px solid color-mix(in srgb, var(--ch-color) 35%, transparent);
}
.storyTauntTail::after {
  content: '';
  position: absolute;
  top: 3px;
  left: -8px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 10px solid rgb(20, 20, 40);
}

.storyTauntCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(20, 20, 40, 0.92);
  border: 1px solid color-mix(in srgb, var(--ch-color) 35%, transparent);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ch-color) 10%, transparent) inset,
    0 8px 24px rgba(0,0,0,0.5),
    0 0 16px color-mix(in srgb, var(--ch-color) 8%, transparent);
  backdrop-filter: blur(8px);
}

.storyTauntChip {
  display: flex;
  align-items: center;
  gap: 6px;
}
.storyTauntEmoji {
  font-size: 14px;
  line-height: 1;
}
.storyTauntName {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--ch-color);
  opacity: 0.9;
}

.storyTauntText {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  color: rgba(255,255,255,0.88);
  font-style: italic;
}

/* Transition */
.storyTauntBubble-enter-active {
  animation: storyTauntIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.storyTauntBubble-leave-active {
  animation: storyTauntOut 0.3s ease-in both;
}
@keyframes storyTauntIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
@keyframes storyTauntOut {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(4px); }
}

</style>

<style>
/* Global styles for taunt bubble inside gameLayout */
.storyTauntWrap {
  position: absolute !important;
  top: 110px;
  left: 14px;
  width: min(320px, calc(420px - 28px));
  padding-top: 12px;
  z-index: 500;
  pointer-events: none;
}
.storyTauntTail {
  position: absolute;
  top: 0px;
  left: 28px;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 13px solid color-mix(in srgb, var(--ch-color) 35%, transparent);
}
.storyTauntTail::after {
  content: '';
  position: absolute;
  top: 3px;
  left: -8px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 10px solid rgb(20, 20, 40);
}
.storyTauntCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(20, 20, 40, 0.92);
  border: 1px solid color-mix(in srgb, var(--ch-color) 35%, transparent);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ch-color) 10%, transparent) inset,
    0 8px 24px rgba(0,0,0,0.5),
    0 0 16px color-mix(in srgb, var(--ch-color) 8%, transparent);
  backdrop-filter: blur(8px);
}
.storyTauntChip {
  display: flex;
  align-items: center;
  gap: 6px;
}
.storyTauntName {
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--ch-color);
}
.storyTauntText {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  color: rgba(255,255,255,0.88);
  font-style: italic;
}

/* First-move adjacency hint — centered overlay over the board */
.adjacencyHintOverlay {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9100;
  padding: 10px 20px;
  border-radius: 12px;
  background: rgba(10, 10, 20, 0.88);
  border: 1px solid rgba(255, 200, 80, 0.5);
  color: rgba(255, 220, 120, 0.95);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 16px rgba(255,200,80,0.12);
  backdrop-filter: blur(8px);
}
.adjHintFade-enter-active { animation: adjHintIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
.adjHintFade-leave-active { animation: adjHintIn 0.2s ease reverse both; }
@keyframes adjHintIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>