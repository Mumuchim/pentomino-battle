<template>
  <div ref="appRoot" class="app" :class="{ inGame: isInGame, hasBottomBar: showBottomBar }">
    <!-- 🔥 Animated RGB background -->
    <div class="bg">
      <div class="bgGradient"></div>
      <div class="bgNoise"></div>
      <div class="bgGlow g1"></div>
      <div class="bgGlow g2"></div>
      <div class="bgGlow g3"></div>
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

    <!-- ✅ Full-screen interaction lock + loading (prevents "loaded but not visible" desync clicks) -->
    <div v-if="uiLock.active" class="loadOverlay" aria-live="polite" aria-busy="true">
      <div class="loadCard">
        <div class="loadTop">
          <img :src="logoUrl" class="loadLogo" alt="" />
          <div class="loadText">
            <img :src="titleUrl" class="loadTitlePng floatingLogo" alt="Pento Battle" />
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

    <header class="topbar" :class="{ pbBar: showMenuChrome }">
      <!-- Menu-style top bar (menus) -->
      <template v-if="showMenuChrome">
        <div class="pbTopLeft">
          <div class="pbTopTitle">
            <template v-if="useMenuPngs && String(topPageTitle).toUpperCase() === 'WELCOME'">
              <img :src="welcomeUrl" class="pbTopTitlePng floatingLogo" alt="WELCOME" />
            </template>
            <template v-else-if="useMenuPngs && String(topPageTitle).toUpperCase() === 'MENU'">
              <img :src="menuTitleUrl" class="pbTopTitlePng floatingLogo" alt="MENU" />
            </template>
            <template v-else-if="useMenuPngs && String(topPageTitle).toUpperCase() === 'LOBBY'">
              <img :src="lobbyTopTitleUrl" class="pbTopTitlePng floatingLogo" alt="LOBBY" />
            </template>
            <template v-else-if="useMenuPngs && screen === 'settings'">
              <img :src="configTopTitleUrl" class="pbTopTitlePng floatingLogo" alt="CONFIG" />
            </template>
            <template v-else>{{ topPageTitle }}</template>
          </div>
        </div>

        <div class="pbTopRight" v-if="screen !== 'auth'">
          <img :src="guestAvatarUrl" class="pbTopAvatar" alt="Profile" />
          <div class="pbTopIgn">
            <span class="pbTopIgnLabel">IGN</span>
            <span class="pbTopIgnName">{{ displayName }}</span>
          </div>
        </div>
</template>

      <!-- Original game top bar (in-game) -->
      <template v-else>
        <div class="brand" @click="goAuth" title="Back to Main Menu">
          <div class="logoMark">
            <img :src="logoUrl" alt="Logo" class="logoImg floatingLogo" />
          </div>
          <div class="brandText">
            <img :src="titleUrl" class="brandTitlePng floatingLogo" alt="Pento Battle" />
          </div>
        </div>

        <div class="right">
          <img :src="guestAvatarUrl" class="topAvatar" alt="Profile" />
          <!-- In-game settings (Esc) -->
          <button
            class="btn ghost imgBtn"
            v-if="isInGame"
            @click="openInGameSettings"
            aria-label="Settings"
            title="Settings (Esc)"
          >
            <img :src="stIconUrl" class="btnPng floatingLogo" alt="Settings" />
          </button>

          <button class="btn ghost imgBtn" v-if="canGoBack" @click="goBack" aria-label="Back">
            <img :src="backBtnUrl" class="btnPng floatingLogo" alt="Back" />
          </button>
          <button class="btn ghost imgBtn" v-if="screen !== 'auth'" @click="goAuth" aria-label="Main Menu">
            <img :src="mainBtnUrl" class="btnPng floatingLogo" alt="Main Menu" />
          </button>

          <!-- Couch Play / AI Mode: Undo last placement (local only) -->
          <button
            class="btn ghost imgBtn"
            v-if="screen === 'couch' || screen === 'ai'"
            :disabled="(game.history?.length || 0) === 0"
            @click="(game.history?.length || 0) > 0 && (uiClick(), game.undoLastMove())"
            aria-label="Undo"
            title="Undo"
          >
            <img :src="undoBtnUrl" class="btnPng floatingLogo" alt="Undo" />
          </button>
          <button class="btn" v-if="isInGame" @click="onPrimaryMatchAction">
            <!-- SURRENDER -->
            <template v-if="String(primaryMatchActionLabel).toLowerCase() === 'surrender'">
              <img :src="surrenderBtnUrl" class="btnPng floatingLogo" alt="Surrender" />
            </template>

            <!-- RESET MATCH -->
            <template v-else-if="String(primaryMatchActionLabel).toLowerCase() === 'reset match'">
              <img :src="resetBtnUrl" class="btnPng floatingLogo" alt="Reset Match" />
            </template>

            <!-- PLAY AGAIN -->
            <template v-else-if="String(primaryMatchActionLabel).toLowerCase() === 'play again'">
              <img :src="playAgainBtnUrl" class="btnPng floatingLogo" alt="Play Again" />
            </template>

            <!-- FALLBACK TEXT -->
            <template v-else>{{ primaryMatchActionLabel }}</template>
          </button>
        </div>
      </template>
    </header>

    <main class="main">
      <!-- =========================
           AUTH MENU
      ========================== -->
      <section v-if="screen === 'auth'" class="menuShell pbShell">
        <div class="pbPane">
          <div class="pbHero">
            <div class="pbHeroTop"></div>

            <!-- WELCOME hero title (AAA-style) -->
            <div class="pbHeroTitle pbWelcomeTitle" aria-label="PentoBattle">
              <template v-if="useSplitBrandPng">
                <div class="pbBrandRow">
                  <img :src="logoUrl" class="pbBrandLogo floatingLogo" alt="Logo" />
                  <img :src="titleUrl" class="pbTitlePng floatingLogo" alt="Pento Battle" />
                </div>
              </template>
              <template v-else>
                <img :src="logoUrl" class="pbWelcomeLogo" alt="" />
                <span class="pbWelcomeWord">PENTO</span>
                <span class="pbWelcomeWord strong">BATTLE</span>
              </template>
            </div>
          </div>

          <div class="pbTiles">
            <button class="pbTile accentBlue disabled" disabled title="Login not implemented yet" @mouseenter="uiHover">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="loginIconUrl" class="pbGlyphPng floatingLogo" alt="LG" />
                  </template>
                  <template v-else>LG</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="loginTitleUrl" class="pbTextPng" alt="LOGIN" />
                    </template>
                    <template v-else>LOGIN</template>
                  </div>
                  <div class="pbTileDesc">not working yet</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentWhite" @mouseenter="uiHover" @click="uiClick(); playAsGuest()">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="playGuestIconUrl" class="pbGlyphPng floatingLogo" alt="GS" />
                  </template>
                  <template v-else>GS</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                  <template v-if="useMenuPngs">
                    <img :src="playGuestTitleUrl" class="pbTextPng" alt="PLAY AS GUEST" />
                  </template>
                  <template v-else>PLAY AS GUEST</template>
                </div>
                  <div class="pbTileDesc">Play Anonymous</div>
                </div>
              </div>
            </button>
          </div>

          <div class="pbFine">Tip: Q rotate • E flip</div>
        </div>
      </section>


      <!-- =========================
           MODE MENU (STACKED)
      ========================== -->
      <section v-else-if="screen === 'mode'" class="menuShell pbShell">
        <div class="pbHeaderRow">
          <div class="pbPageTitle">
          <template v-if="useMenuPngs">
            <img :src="menuTitleUrl" class="pbHeaderPng" alt="MENU" />
          </template>
          <template v-else>MENU</template>
        </div>
        </div>

        <div class="pbPane">
          <div class="pbHero compact">
            <div class="pbHeroTitle">FLIP | ROTATE | DOMINATE</div>
          </div><div class="pbTiles">
            <button
              class="pbTile accentYellow"
              :disabled="!loggedIn"
              :class="{ disabled: !loggedIn }"
              :title="!loggedIn ? 'Ranked requires login' : ''"
              @mouseenter="uiHover"
              @click="uiClick(); goRanked()"
            >
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="rkIconUrl" class="pbGlyphPng floatingLogo" alt="RK" />
                  </template>
                  <template v-else>RK</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="rankedTitleUrl" class="pbTextPng" alt="RANKED" />
                    </template>
                    <template v-else>RANKED</template>
                  </div>
                  <div class="pbTileDesc">auto finds lobby with same tier</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentGreen" @mouseenter="uiHover" @click="uiClick(); startQuickMatchAuto()">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="qmIconUrl" class="pbGlyphPng floatingLogo" alt="QM" />
                  </template>
                  <template v-else>QM</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="quickMatchTitleUrl" class="pbTextPng" alt="QUICK MATCH" />
                    </template>
                    <template v-else>QUICK MATCH</template>
                  </div>
                  <div class="pbTileDesc">finding opponent · please wait</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentPurple" @mouseenter="uiHover" @click="uiClick(); goLobby()">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="lbIconUrl" class="pbGlyphPng floatingLogo" alt="LB" />
                  </template>
                  <template v-else>LB</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="goLobbyTitleUrl" class="pbTextPng" alt="GO TO LOBBY" />
                    </template>
                    <template v-else>GO TO LOBBY</template>
                  </div>
                  <div class="pbTileDesc">create session · browse rooms · join by code</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentPeach" @mouseenter="uiHover" @click="uiClick(); startCouchPlay()">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="onePIconUrl" class="pbGlyphPng floatingLogo" alt="1P" />
                  </template>
                  <template v-else>1P</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="couchPlayTitleUrl" class="pbTextPng" alt="COUCH PLAY" />
                    </template>
                    <template v-else>COUCH PLAY</template>
                  </div>
                  <div class="pbTileDesc">local 2-player on one device</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentBlue" @mouseenter="uiHover" @click="uiClick(); startPracticeAi()">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="aiIconUrl" class="pbGlyphPng floatingLogo" alt="AI" />
                  </template>
                  <template v-else>AI</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="practiceAiTitleUrl" class="pbTextPng" alt="PRACTICE VS AI" />
                    </template>
                    <template v-else>PRACTICE VS AI</template>
                  </div>
                  <div class="pbTileDesc">local 1-player vs computer</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentWhite" @mouseenter="uiHover" @click="uiClick(); screen = 'settings'">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="stIconUrl" class="pbGlyphPng floatingLogo" alt="ST" />
                  </template>
                  <template v-else>ST</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="settingsTitleUrl" class="pbTextPng" alt="SETTINGS" />
                    </template>
                    <template v-else>SETTINGS</template>
                  </div>
                  <div class="pbTileDesc">controls · preferences</div>
                </div>
              </div>
            </button>

            <button class="pbTile accentWhite" @mouseenter="uiHover" @click="uiClick(); screen = 'credits'">
              <div class="pbTileInner">
                <div class="pbTileGlyph">
                  <template v-if="useMenuPngs">
                    <img :src="crIconUrl" class="pbGlyphPng floatingLogo" alt="CR" />
                  </template>
                  <template v-else>CR</template>
                </div>
                <div class="pbTileText">
                  <div class="pbTileTitle">
                    <template v-if="useMenuPngs">
                      <img :src="creditsTitleUrl" class="pbTextPng" alt="CREDITS" />
                    </template>
                    <template v-else>CREDITS</template>
                  </div>
                  <div class="pbTileDesc">about the game</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>


            <!-- =========================
           LOBBY
      ========================== -->
      <section v-else-if="screen === 'lobby'" class="menuShell pbShell pbShellCentered">
        <div class="vsStylePanel">
          <div class="vsStyleHeader">
            <div class="vsStyleHeaderGlow"></div>
            <div class="vsStyleTitle">⚡ MULTIPLAYER</div>
            <div class="vsStyleSubtitle">Create session · Browse rooms · Join by code</div>
          </div>

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

              <label class="pbField inline">
                <span>PRIVATE</span>
                <input class="pbCheck" type="checkbox" v-model="quick.isPrivate" />
              </label>
            </div>

            <div class="pbRow">
              <button class="pbMiniBtn imgBtn" @mouseenter="uiHover" @click="uiClick(); refreshLobby()" aria-label="Refresh">
                <img :src="refreshBtnUrl" class="btnPng floatingLogo" alt="Refresh" />
              </button>
              <button class="pbMiniBtn primary imgBtn" @mouseenter="uiHover" @click="uiClick(); lobbyCreate()" aria-label="Create">
                <img :src="createBtnUrl" class="btnPng floatingLogo" alt="Create" />
              </button>
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
              <button class="pbMiniBtn primary imgBtn" @mouseenter="uiHover" @click="uiClick(); lobbySearchOrJoin()" aria-label="Go">
                <img :src="goBtnUrl" class="btnPng floatingLogo" alt="Go" />
              </button>
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
                  <div class="pbLobbyName">{{ l.lobby_name || "Public Lobby" }}</div>
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
      <section v-else-if="screen === 'settings'" class="menuShell pbShell pbShellCentered">
        <div class="vsStylePanel">
          <div class="vsStyleHeader">
            <div class="vsStyleHeaderGlow"></div>
            <div class="vsStyleTitle">⚙ SETTINGS</div>
            <div class="vsStyleSubtitle">Controls · Preferences</div>
          </div>

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

            <div class="vsStyleFinePrint">Board is fixed to <b>10×6</b>. Tip: Q rotate · E flip</div>
          </div>
        </div>
      </section>

      <!-- =========================
           CREDITS
      ========================== -->
      <section v-else-if="screen === 'credits'" class="menuShell pbShell pbShellCentered">
        <div class="vsStylePanel">
          <div class="vsStyleHeader">
            <div class="vsStyleHeaderGlow"></div>
            <div class="vsStyleTitle">✦ CREDITS</div>
            <div class="vsStyleSubtitle">About the game</div>
          </div>
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
                tbP1: game.phase !== 'gameover' && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === 1,
                tbP2: game.phase !== 'gameover' && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === 2,
                tbEnd: game.phase === 'gameover',
                tbYours: isOnline && myPlayer && (game.phase === 'draft' ? game.draftTurn : game.currentPlayer) === myPlayer,
              }"
            >
              <div class="tbGlow" aria-hidden="true"></div>
              <div class="tbLeft">
                <div class="tbPhaseTag">{{ game.phase === 'draft' ? 'DRAFT' : game.phase === 'place' ? 'BATTLE' : 'END' }}</div>
                <div class="tbMain">
                  <span v-if="game.phase === 'draft'">
                    <span class="tbPlayerNum">P{{ game.draftTurn }}</span> PICKING
                    <span v-if="isOnline && myPlayer === game.draftTurn" class="tbYouTag">YOU</span>
                    <span v-else-if="screen === 'ai' && game.draftTurn === humanPlayer" class="tbYouTag">YOU</span>
                  </span>
                  <span v-else-if="game.phase === 'place'">
                    <span class="tbPlayerNum">P{{ game.currentPlayer }}</span> TURN
                    <span v-if="isOnline && myPlayer === game.currentPlayer" class="tbYouTag">YOU</span>
                    <span v-else-if="screen === 'ai' && game.currentPlayer === humanPlayer" class="tbYouTag">YOU</span>
                  </span>
                  <span v-else>GAME OVER</span>
                </div>
                <div class="tbSub" v-if="phaseSub">{{ phaseSub }}</div>
              </div>
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
            </div>

            <!-- ── DUAL CLOCKS: all modes in place phase ── -->
            <div v-if="game.phase === 'place'" class="hudGrid hudClocks">
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
              <span v-if="game.phase === 'place'" class="hudControlsHint">
                <b>Q</b> Rotate &nbsp;·&nbsp; <b>E</b> Flip
              </span>
              <!-- AI score row -->
              <span v-if="screen === 'ai' && aiRound > 1" class="hudAiScore">
                {{ aiScore.p1 }}–{{ aiScore.p2 }} · R{{ aiRound }}
              </span>
            </div>

          </div>

          <DraftPanel v-if="game.phase === 'draft'" />

          <section v-else class="panel">
            <h2 class="panelTitle">Player {{ game.currentPlayer }} Pieces</h2>
            <PiecePicker :isOnline="isOnline" :myPlayer="myPlayer" :canAct="canAct" />

            <div class="divider"></div>
            <Controls :isOnline="isOnline" :canAct="canAct" />
          </section>
        </section>

        <section class="rightPanel">
          <Board :isOnline="isOnline" :myPlayer="myPlayer" :canAct="canAct" />

        </section>
      </section>
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

<!-- Menu-style bottom bar (menus) -->
<footer v-if="showBottomBar" class="pbBottomBar">
  <!-- Left: MADE BY -->
  <div class="pbBottomLeft">
    <div class="pbBottomHint">
      <template v-if="useMenuPngs">
        <img :src="madeByUrl" class="pbBottomPng" alt="MADE BY MUMUCHXM" />
      </template>
      <template v-else>MADE BY MUMUCHXM</template>
    </div>
  </div>

  <!-- Center: Logo + Title -->
  <div class="pbBottomCenter" v-if="screen !== 'auth'">
    <img :src="logoUrl" alt="" class="pbBottomLogo" />
    <img :src="titleUrl" alt="Pento Battle" class="pbBottomBrandPng" />
  </div>

  <!-- Right: Back (menu pages) -->
  <div class="pbBottomRight">
    <button
      v-if="canGoBack"
      class="btn ghost imgBtn pbBottomBackBtn"
      @click="goBack"
      aria-label="Back"
      title="Back"
    >
      <img :src="backBtnUrl" class="btnPng floatingLogo" alt="Back" />
    </button>
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
          <p v-for="(line, i) in modalLines" :key="i" class="rmMsg">{{ line }}</p>
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
            <img v-if="actionPngUrl(a)" :src="actionPngUrl(a)" class="btnPng floatingLogo" :alt="a.label || 'Action'" />
            <span v-else>{{ a.label }}</span>
          </button>
        </div>
      </div>

      <!-- ══ STANDARD MODAL ══ -->
      <div v-else class="modalCard" :class="modalCardClass" role="dialog" aria-modal="true">
        <!-- Accent stripe -->
        <div class="modalStripe" :class="modalDotClass" aria-hidden="true"></div>

        <div class="modalInner">
          <!-- Header -->
          <div class="modalHead">
            <div class="modalIconDot" :class="modalDotClass" aria-hidden="true"></div>
            <div class="modalTitle2">{{ modal.title }}</div>
          </div>

          <!-- Body -->
          <div class="modalBody">
            <p class="modalMsg" v-for="(line, i) in modalLines" :key="i">{{ line }}</p>
          </div>

          <!-- Actions -->
          <div class="modalActions">
            <button
              v-for="(a, i) in modal.actions"
              :key="i"
              class="btn"
              :class="{ primary: a.tone === 'primary', soft: a.tone === 'soft', ghost: a.tone === 'ghost' }"
              @mouseenter="uiHover"
              @click="uiClick(); onModalAction(a)"
            >
              <img v-if="actionPngUrl(a)" :src="actionPngUrl(a)" class="btnPng floatingLogo" :alt="a.label || 'Action'" />
              <span v-else>{{ a.label }}</span>
            </button>
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
            <button class="btn soft imgBtn" @mouseenter="uiHover" @click="uiClick(); qmDecline()" aria-label="Decline">
              <img :src="declineBtnUrl" class="btnPng floatingLogo" alt="Decline" />
            </button>
            <button class="btn primary imgBtn" @mouseenter="uiHover" @click="uiClick(); qmAcceptClick()" :disabled="qmAccept.myAccepted" aria-label="Accept">
              <img :src="acceptBtnUrl" class="btnPng floatingLogo" alt="Accept" />
            </button>
          </div>
        </div>
      </div>
    </div>

<!-- ✅ VS AI Difficulty Picker -->
    <Transition name="vsAiFade">
      <div v-if="showVsAiPicker" class="vsAiOverlay" @click.self="showVsAiPicker = false">
        <div class="vsAiPanel">
          <div class="vsAiHeader">
            <div class="vsAiHeaderGlow"></div>
            <div class="vsAiTitle">⚔ VERSUS AI</div>
            <div class="vsAiSubtitle">Choose your opponent's rank</div>
          </div>
          <div class="vsAiRanks">
            <button
              v-for="(rank, idx) in [
                { id:'dumbie',      label:'DUMBIE',      sub:'The Learning Dummy',     icon:'🟢', tier:0 },
                { id:'elite',       label:'ELITE',       sub:'Sharpened Strategist',   icon:'🔵', tier:1 },
                { id:'tactician',   label:'TACTICIAN',   sub:'Master of Patterns',     icon:'🟣', tier:2 },
                { id:'grandmaster', label:'GRANDMASTER', sub:'The Territorial God',    icon:'🟠', tier:3 },
                { id:'legendary',   label:'LEGENDARY',   sub:'Beyond Human Reach',     icon:'🔴', tier:4 },
              ]"
              :key="rank.id"
              class="vsAiRankCard"
              :class="[`tier${rank.tier}`, { locked: !aiUnlocks[rank.id], unlocked: aiUnlocks[rank.id] }]"
              @click="selectAiDifficulty(rank.id)"
              @mouseenter="aiUnlocks[rank.id] && uiHover()"
            >
              <div class="vsAiRankGlow"></div>
              <div class="vsAiRankNum">{{ String(idx + 1).padStart(2,'0') }}</div>
              <div class="vsAiRankIcon">
                <span v-if="!aiUnlocks[rank.id]" class="vsAiLockIcon">🔒</span>
                <span v-else class="vsAiTierIcon">{{ rank.icon }}</span>
              </div>
              <div class="vsAiRankInfo">
                <div class="vsAiRankLabel">{{ rank.label }}</div>
                <div class="vsAiRankSub" v-if="aiUnlocks[rank.id]">{{ rank.sub }}</div>
                <div class="vsAiRankSub locked" v-else>
                  Beat {{ idx === 1 ? 'Dumbie' : idx === 2 ? 'Elite' : idx === 3 ? 'Tactician' : 'Grandmaster' }} to unlock
                </div>
              </div>
              <div class="vsAiRankArrow" v-if="aiUnlocks[rank.id]">▶</div>
              <div class="vsAiRankChain" v-if="idx < 4"></div>
            </button>
          </div>
          <button class="vsAiClose" @click="showVsAiPicker = false">✕ CANCEL</button>
        </div>
      </div>
    </Transition>

    <!-- ✅ Unlock Animation Overlay -->
    <Transition name="unlockFade">
      <div v-if="unlockAnim.active" class="unlockOverlay" @click="closeUnlockAnim">
        <div class="unlockBurst"></div>
        <div class="unlockCard" :class="`unlockTier${['dumbie','elite','tactician','grandmaster','legendary'].indexOf(unlockAnim.rank)}`">
          <div class="unlockGlowRing"></div>
          <div class="unlockEmoji">
            {{ unlockAnim.rank === 'elite' ? '🔵' : unlockAnim.rank === 'tactician' ? '🟣' : unlockAnim.rank === 'grandmaster' ? '🟠' : '🔴' }}
          </div>
          <div class="unlockLabel">NEW RANK UNLOCKED</div>
          <div class="unlockRankName">
            {{ unlockAnim.rank === 'elite' ? 'ELITE' : unlockAnim.rank === 'tactician' ? 'TACTICIAN' : unlockAnim.rank === 'grandmaster' ? 'GRANDMASTER' : 'LEGENDARY' }}
          </div>
          <div class="unlockRankDesc">
            {{ unlockAnim.rank === 'elite' ? 'Sharpened Strategist' : unlockAnim.rank === 'tactician' ? 'Master of Patterns' : unlockAnim.rank === 'grandmaster' ? 'The Territorial God' : 'Beyond Human Reach' }}
          </div>
          <div class="unlockTap">Tap to continue</div>
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
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useGameStore } from "./store/game";
import { supabase as sbRealtime } from "./lib/supabase";
import { getPieceStyle } from "./lib/pieceStyles";
import { boundsOf, transformCells } from "./lib/geom";
import { PENTOMINOES } from "./lib/pentominoes";

import Board from "./components/Board.vue";
import DraftPanel from "./components/DraftPanel.vue";
import PiecePicker from "./components/PiecePicker.vue";
import Controls from "./components/Controls.vue";


const game = useGameStore();

const screen = ref("auth");
const loggedIn = ref(false);
const allowFlip = ref(true);
const guestName = ref("GUEST");
const displayName = computed(() => (loggedIn.value ? "PLAYER" : guestName.value));

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

// ── Unified cursor-following drag ghost ─────────────────────────────────────
// Visible only while dragging AND cursor is NOT over the board (the board's own
// green/red ghostOverlay handles the on-board visual — this one covers everything else).
const cursorGhostVisible = computed(() =>
  !!(game.drag?.active && game.drag?.pieceKey && !game.drag?.target?.inside)
);

const cursorGhostBlocks = computed(() => {
  if (!game.drag?.pieceKey) return [];
  return (game.selectedCells || []).map(([x, y]) => ({ x, y }));
});

const _cgBounds = computed(() => {
  const cells = cursorGhostBlocks.value;
  if (!cells.length) return { w: 1, h: 1 };
  return boundsOf(cells.map(b => [b.x, b.y]));
});

const _cgCell = computed(() => Math.max(22, game.boardCellPx || 32));
const _cgGap = 3;

const cursorGhostContainerStyle = computed(() => {
  const cx = game.drag?.x ?? 0;
  const cy = game.drag?.y ?? 0;
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
  const s = getPieceStyle(game.drag?.pieceKey || '');
  const base = {
    gridColumn: b.x + 1,
    gridRow: b.y + 1,
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
// Split brand assets (replaceable):
// - ./assets/logo.png  (icon)
// - ./assets/title.png (PENTO BATTLE text)
const titleUrl = new URL("./assets/title.png", import.meta.url).href;
const useSplitBrandPng = ref(true); // toggle off to fall back to text title

// Replaceable button PNGs (safe placeholders included in /assets)
const backBtnUrl = new URL("./assets/back.png", import.meta.url).href;
const undoBtnUrl = new URL("./assets/undo.png", import.meta.url).href;
const applyBtnUrl = new URL("./assets/apply.png", import.meta.url).href;
const refreshBtnUrl = new URL("./assets/refresh.png", import.meta.url).href;
const goBtnUrl = new URL("./assets/go.png", import.meta.url).href;
const createBtnUrl = new URL("./assets/create.png", import.meta.url).href;
const mainBtnUrl = new URL("./assets/main.png", import.meta.url).href;
const surrenderBtnUrl = new URL("./assets/surrender.png", import.meta.url).href;
// Modal / action button PNGs (safe placeholders included in /assets)
const okBtnUrl = new URL("./assets/ok.png", import.meta.url).href;
const closeBtnUrl = new URL("./assets/close.png", import.meta.url).href;
const cancelBtnUrl = new URL("./assets/cancel.png", import.meta.url).href;
const cancelWaitingBtnUrl = new URL("./assets/cancel_waiting.png", import.meta.url).href;
const confirmBtnUrl = new URL("./assets/confirm.png", import.meta.url).href;
const acceptBtnUrl = new URL("./assets/accept.png", import.meta.url).href;
const declineBtnUrl = new URL("./assets/decline.png", import.meta.url).href;
const joinBtnUrl = new URL("./assets/join.png", import.meta.url).href;
const copyBtnUrl = new URL("./assets/copy.png", import.meta.url).href;
const playAgainBtnUrl = new URL("./assets/play_again.png", import.meta.url).href;
const resetBtnUrl = new URL("./assets/reset.png", import.meta.url).href;


// Extra replaceable menu PNG assets (safe placeholders included in /assets)
const welcomeUrl = new URL("./assets/welcome.png", import.meta.url).href;
const menuTitleUrl = new URL("./assets/menu.png", import.meta.url).href;
const madeByUrl = new URL("./assets/madeby.png", import.meta.url).href;

// Top bar titles (replaceable)
const lobbyTopTitleUrl = new URL("./assets/lobby.png", import.meta.url).href;
const configTopTitleUrl = new URL("./assets/config.png", import.meta.url).href;

// Audio
// - Menu BGM (starts on first click due to autoplay restrictions)
// - Separate BGM for Couch/AI and Online matches
const menuBgmUrl = new URL("./assets/audio/bgm.mp3", import.meta.url).href;
const couchBgmUrl = new URL("./assets/audio/couch_bgm.mp3", import.meta.url).href;
const onlineBgmUrl = new URL("./assets/audio/online_bgm.mp3", import.meta.url).href;

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

function tryPlayGameBgm() {
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

const stIconUrl = new URL("./assets/st_icon.png", import.meta.url).href;
const settingsTitleUrl = new URL("./assets/settings.png", import.meta.url).href;

const crIconUrl = new URL("./assets/cr_icon.png", import.meta.url).href;
const creditsTitleUrl = new URL("./assets/credits.png", import.meta.url).href;

// Toggle: replace specific menu texts with PNGs (falls back to text if turned off)
const useMenuPngs = ref(true);


const quick = reactive({
  lobbyName: "",
  isPrivate: false,
  joinCode: "",
});

const rankedTier = computed(() => (loggedIn.value ? "Wood" : "—"));

const isInGame = computed(() => screen.value === "couch" || screen.value === "ai" || screen.value === "online");
const modeLabel = computed(() => {
  if (screen.value === "ai") {
    const labels = { dumbie: "Dumbie", elite: "Elite", tactician: "Tactician", grandmaster: "Grandmaster", legendary: "Legendary" };
    const roundStr = aiRound.value > 1 ? ` · R${aiRound.value}` : '';
    return `VS AI · ${labels[aiDifficulty.value] || "Dumbie"}${roundStr}`;
  }
  return screen.value === "couch" ? "Couch Play" : screen.value === "online" ? "Online Match" : "—";
});

const phaseTitle = computed(() => {
  if (game.phase === "draft") return "Drafting";
  if (game.phase === "place") return "Battle";
  if (game.phase === "gameover") return "Game Over";
  return game.phase || "—";
});

const phaseSub = computed(() => {
  if (game.phase === "draft") {
    if (screen.value === "ai") {
      return game.draftTurn === humanPlayer.value ? "Your Pick" : "AI Picking…";
    }
    return `Pick: P${game.draftTurn}`;
  }
  if (game.phase === "place") {
    if (screen.value === "ai") {
      return game.currentPlayer === humanPlayer.value ? "Your Turn" : "AI Thinking…";
    }
    return `Turn: P${game.currentPlayer}`;
  }
  return "";
});

const canGoBack = computed(() =>
  ["mode", "lobby", "settings", "credits", "ranked"].includes(screen.value)
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
  if (screen.value === "auth") return "WELCOME"; // Welcome page
  if (screen.value === "mode") return "MENU"; // Main menu page
  if (screen.value === "lobby") return "LOBBY";
  if (screen.value === "ranked") return "RANKED";
  if (screen.value === "settings") return "CONFIG";
  if (screen.value === "credits") return "ABOUT";
  return "MENU";
});
const showMenuChrome = computed(() => isMenuScreen.value && ["auth","mode","lobby","ranked","settings","credits"].includes(screen.value));
const showBottomBar = computed(() => showMenuChrome.value);

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

  // Draft timer (countdown)
  if (game.phase === "draft") {
    if (!game.turnStartedAt) return null;
    const limit = game.turnLimitDraftSec || 30;
    // In online mode use server-corrected clock to avoid drift from DB latency
    const now = isOnline.value ? serverNow() : nowTick.value;
    const left = Math.max(0, limit - (now - game.turnStartedAt) / 1000);
    const s = Math.ceil(left);
    return { kind: "draft", seconds: s, value: `${s}s` };
  }

  // Battle clock (place phase): show for online, AI mode, and couch
  if (game.phase === "place") {
    const p = game.currentPlayer === 2 ? 2 : 1;
    const v = fmtClock(game.battleClockSec?.[p] ?? 0);
    return { kind: "clock", player: p, value: v };
  }

  return null;
});

// Top-right button
const primaryMatchActionLabel = computed(() => {
  if (!isInGame.value) return "";
  if (isOnline.value) return game.phase === "gameover" ? "Play Again" : "Surrender";
  return "Reset Match";
});

const canAct = computed(() => {
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
    if (["online", "couch", "ai"].includes(nv)) {
      startUiLock({ label: "Loading match…", hint: "Syncing visuals and state…", minMs: 850 });
      stopUiLockAfterPaint(850);
    }
    if (["auth", "mode", "lobby", "settings", "credits", "ranked"].includes(nv)) {
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
    showModal({ title: 'Copied', tone: 'good', message: 'Copied to clipboard.' });
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
      showModal({ title: 'Copied', tone: 'good', message: 'Copied to clipboard.' });
    } catch {
      showModal({ title: 'Copy Failed', tone: 'bad', message: 'Could not copy. Please copy manually.' });
    }
  }
}

function copyLobbyCode() {
  if (!online.code) return;
  copyToClipboard(online.code);
}

function showModal({ title = "Notice", message = "", tone = "info", actions = null, locked = false } = {}) {
  modal.title = title;
  modal.message = message;
  modal.tone = tone;
  // If actions is explicitly provided as an array (even empty), respect it.
  // If actions is null/undefined, default to a single OK button.
  if (Array.isArray(actions)) modal.actions = actions;
  else modal.actions = [{ label: "OK", tone: "primary" }];
  modal.locked = !!locked;
  modal.open = true;
}

function closeModal() {
  modal.open = false;
  modal.actions = [];
  modal.locked = false;
}


function actionPngUrl(action) {
  const lab = String(action?.label || "").trim().toLowerCase();
  if (!lab) return "";
  // Normalize some common labels
  const norm = lab
    .replace(/\s+/g, " ")
    .replace(/…/g, "...")
    .replace(/\u2013|\u2014/g, "-");
  if (norm === "ok") return okBtnUrl;
  if (norm === "close") return closeBtnUrl;
  if (norm === "cancel") return cancelBtnUrl;
  if (norm === "cancel waiting") return cancelWaitingBtnUrl;
  if (norm === "confirm") return confirmBtnUrl;
  if (norm === "accept") return acceptBtnUrl;
  if (norm === "decline") return declineBtnUrl;
  if (norm === "join") return joinBtnUrl;
  if (norm === "copy code" || norm === "copy") return copyBtnUrl;
  if (norm === "play again") return playAgainBtnUrl;
  if (norm === "reset" || norm === "reset match") return resetBtnUrl;
  return "";
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

  // Clock sync: offset between local Date.now() and server epoch (ms).
  // server_time = Date.now() + serverTimeOffset
  // Measured once at connect via round-trip ping.
  serverTimeOffset: 0,

  // Supabase Realtime (near-instant sync)
  rtEnabled: false,
  rtChannel: null,
});

const publicLobbies = ref([]);
const loadingPublic = ref(false);
const myPrivateLobbies = ref([]);
const loadingPrivate = ref(false);

function getGuestId() {
  const k = "pb_guest_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = (crypto?.randomUUID?.() || `g_${Math.random().toString(16).slice(2)}_${Date.now()}`).toString();
    localStorage.setItem(k, id);
  }
  return id;
}

function getGuestName() {
  const k = "pb_guest_name";
  let name = localStorage.getItem(k);
  if (!name) {
    const id = getGuestId();
    // Make a stable 4-digit code from the UUID-ish guest id
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const num = (h % 10000).toString().padStart(4, "0");
    name = `GUEST-${num}`;
    localStorage.setItem(k, name);
  }
  return name;
}

// Ensure guest name is ready for menus/topbar
try {
  guestName.value = getGuestName();
} catch {}


function sbConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return { url, anon };
}

function sbHeaders() {
  const { anon } = sbConfig();
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
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
  teardownRealtimeLobby();
}

async function leaveOnlineLobby(reason = "left") {
  if (!online.lobbyId) return;
  if (!isOnline.value) return;

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const me = getGuestId();
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
        String(lobby.lobby_name || "") === "__QM__" || String(st?.meta?.kind || "") === "quickmatch";

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
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Select lobby failed (${res.status})`);
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbSelectLobbyByCode(code) {
  const safe = String(code || "").trim();
  const res = await fetch(sbRestUrl(`pb_lobbies?code=eq.${encodeURIComponent(safe)}&select=*`), {
    headers: sbHeaders(),
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

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
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

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
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
  const hostId = getGuestId();
  const lobbyMode = String(mode || (extraStateMeta?.kind === "quickmatch" ? "quick" : "custom") || "custom");
  const code = `PB-${Math.random().toString(16).slice(2, 6).toUpperCase()}${Math.random()
    .toString(16)
    .slice(2, 6)
    .toUpperCase()}`;

  const payload = {
    code,
    status: "waiting",
    is_private: !!isPrivate,
    lobby_name: String(lobbyName || "").slice(0, 40),
    mode: lobbyMode,
    host_id: hostId,
    guest_id: null,
    host_ready: false,
    guest_ready: false,
    state: { meta: { ...(extraStateMeta || {}) } },
    version: 1,
  };

  const res = await fetch(sbRestUrl("pb_lobbies"), {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Create lobby failed (${res.status})\n${txt}`);
  }

  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbJoinLobby(lobbyId) {
  const guestId = getGuestId();

  // ✅ Guard join so you can't join closed/full/expired lobbies.
  // This PATCH will only succeed if the lobby is still waiting and has no guest.
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&guest_id=is.null&status=eq.waiting`), {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      guest_id: guestId,
      // Keep status as 'waiting' until the match is fully initialized (players assigned).
      // This avoids edge cases where clients treat unknown statuses differently.
      status: "waiting",
      updated_at: new Date().toISOString(),
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
    headers: sbHeaders(),
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
  const metaWithHb = { ...meta, heartbeat: hb };

  return {
    meta: metaWithHb,
    game: {
      phase: game.phase,
      boardW: game.boardW,
      boardH: game.boardH,
      allowFlip: game.allowFlip,

      board: deepClone(game.board),
      draftBoard: deepClone(game.draftBoard),

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
      battleClockLastTickAt: game.battleClockLastTickAt,

      // Helps prevent false timeouts under latency
      timeoutPendingAt: game.timeoutPendingAt,
      timeoutPendingPlayer: game.timeoutPendingPlayer,

      // Needed for correct gameover messaging (surrender / timeout) across both clients.
      lastMove: deepClone(game.lastMove),

      // Monotonic sequence to prevent last-write-wins clobber.
      moveSeq: Number(game.moveSeq || 0),
    },
  };
}

function applySyncedState(state) {
  if (!state || !state.game) return;

  // ✅ Anti-clobber (stronger): never apply an older move sequence.
  // This prevents the visible “snap back” where an older remote snapshot briefly overwrites
  // a newer local move (even if it later corrects itself).
  try {
    const localSeq = Number(game.moveSeq || 0);
    const remoteSeq = Number(state?.game?.moveSeq || 0);
    if (remoteSeq && localSeq && remoteSeq < localSeq) return;
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
      draftBoard: g.draftBoard,

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
      battleClockLastTickAt: g.battleClockLastTickAt,

      timeoutPendingAt: g.timeoutPendingAt,
      timeoutPendingPlayer: g.timeoutPendingPlayer,

      lastMove: g.lastMove,

      moveSeq: Number(g.moveSeq || 0),
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
    headers: { ...sbHeaders(), Prefer: "return=representation" },
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
    headers: { ...sbHeaders(), Prefer: "return=representation" },
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

function maybeSetMyPlayerFromLobby(lobby) {
  const myId = getGuestId();
  const players = lobby?.state?.meta?.players;

  if (players) {
    myPlayer.value = getMyPlayerFromPlayers(players, myId);
    return;
  }

}

async function ensureOnlineInitialized(lobby) {
  if (!lobby) return;

  const hasPlayers = !!lobby?.state?.meta?.players;
  if (hasPlayers) return;
  if (!lobby.host_id || !lobby.guest_id) return;

  // ── prevMeta MUST be declared before any usage below ──────────────
  const prevMeta = lobby.state?.meta ? lobby.state.meta : {};
  const nextRound = Number(prevMeta.round || 0) + 1;

  // Randomize player numbers for THIS round, then write it once into meta.
  const { players } = makeRandomPlayers(lobby.host_id, lobby.guest_id);

  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  // Apply lobby timer (set by host when creating the room: 3, 5, or 7 minutes)
  const timerMins = Number(prevMeta?.timerMinutes || 3);
  const timerSecs = Math.max(60, Math.min(1800, timerMins * 60));
  game.battleClockInitSec = timerSecs;
  game.battleClockSec = { 1: timerSecs, 2: timerSecs };

  const initState = buildSyncedState({
    ...prevMeta,
    players,
    round: nextRound,
    roundSeed: makeRoundSeed(),
    started_at: new Date().toISOString(),
  });

  const nextVersion = Number(lobby.version || 0) + 1;

  try {
    // Prefer guarded patch to avoid race if both clients try to init at once.
    const updated = await sbPatchStateWithVersionGuard(lobby.id, lobby.version, {
      state: initState,
      version: nextVersion,
      status: "playing",
      updated_at: new Date().toISOString(),
    });

    online.lastAppliedVersion = updated?.version || nextVersion;
  } catch {
    // If it failed, assume the other side initialized it.
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

function setupRealtimeLobby(lobbyId) {
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
        (payload) => {
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

            maybeSetMyPlayerFromLobby(row);

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

function startPollingLobby(lobbyId, role) {
  // ✅ Prevent early clicks while the online screen + first poll are not fully rendered.
  startUiLock({ label: "Connecting…", hint: "Establishing link to lobby…", minMs: 900 });

  stopPolling();
  online.polling = true;
  online.lobbyId = lobbyId;
  online.role = role;
  online.lastAppliedVersion = 0;
  online.lastSeenUpdatedAt = null;


  // ✅ Reset per-lobby trackers (prevents false 'opponent left' on fresh lobbies)
  online.lastHostId = null;
  online.lastGuestId = null;
  online.waitingForOpponent = true;
  online.code = null;
  online.pingMs = null;
  online.localDirty = false;
  online.hostWaitStartedAt = role === "host" ? Date.now() : null;
  myPlayer.value = null;

  // Near-instant sync via Supabase Realtime (polling remains as fallback + presence/TTL logic)
  // Also measure server clock offset for timer sync
  measureServerTimeOffset();
  setupRealtimeLobby(lobbyId);

  screen.value = "online";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
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
        screen.value = "mode";
        showModal({ title: "Lobby Closed", message: "The lobby no longer exists.\nReturning to main menu.", tone: "bad" });
        return;
      }

      online.code = lobby.code || online.code;

      // ✅ Lightweight presence heartbeat (even while waiting) so stale rooms can be cleaned up.
      // Throttled to avoid spamming the DB.
      if (online.role && (online.waitingForOpponent || game.phase === "gameover")) {
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
        screen.value = "mode";
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
      if (online.role === "host" && online.waitingForOpponent && online.code) {
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
        screen.value = "mode";
        showModal({
          title: "Match Terminated",
          tone: "bad",
          message: "Lobby creator left — terminating the game.\nReturning to main menu.",
        });
        return;
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
          // If the host disappeared, end the match and leave.
          try {
            await sbCloseAndNukeLobby(lobbyId, { terminateReason: "host_timeout", reason: "heartbeat" });
          } catch {
            // ignore
          }
          stopPolling();
          myPlayer.value = null;
          screen.value = "mode";
          showModal({
            title: "Match Terminated",
            tone: "bad",
            message: "Lobby creator disconnected — terminating the game.\nReturning to main menu.",
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
            screen.value = "mode";
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

      online.waitingForOpponent = !(lobby.host_id && lobby.guest_id && lobby?.state?.meta?.players);

      // If the match is ready, ensure the waiting modal is gone.
      if (!online.waitingForOpponent && modal.open && modal.title === "Waiting for Opponent") {
        closeModal();
      }

      if (lobby.host_id && lobby.guest_id) {
        await ensureOnlineInitialized(lobby);
      }

      maybeSetMyPlayerFromLobby(lobby);

      const v = Number(lobby.version || 0);
      const st = lobby.state || null;

      if (st && v && v > (online.lastAppliedVersion || 0)) {
        online.lastAppliedVersion = v;
        online.lastSeenUpdatedAt = lobby.updated_at || null;
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
    // - If Realtime is active, keep polling light (presence/TTL + recovery).
    // - Otherwise poll aggressively for responsiveness.
    const fast = !online.waitingForOpponent && (game.phase === "draft" || game.phase === "place");
    const ms = online.rtEnabled ? (fast ? 1100 : 1700) : (fast ? 260 : 650);
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
   ONLINE RESET / ACTIONS
========================= */
async function onResetClick() {
  if (!isOnline.value || !online.lobbyId) {
    game.resetGame();
    return;
  }

  // Prefer a single author for round resets to avoid version fights.
  // Host resets the round; guest simply waits for the new state.
  if (online.role !== "host") {
    game.resetGame();
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

    game.boardW = 10;
    game.boardH = 6;
    game.allowFlip = allowFlip.value;
    game.resetGame();

    const snapshot = buildSyncedState({
      ...meta,
      players,
      round: nextRound,
      roundSeed: makeRoundSeed(),
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
    if (lm === "timeout") return "Opponent timer runs out.";
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
    screen.value = "mode";
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
    screen.value = "mode";
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

function ensureRematchPrompt() {
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

watch(
  () => game.phase,
  (p, prev) => {
    if (p !== "gameover" || prev === "gameover") return;

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
        if (humanWon) { aiScore.p1++; tryUnlockNextDifficulty(1, 1); }
        else if (aiWon) aiScore.p2++;

        const diffLabel = { dumbie:'Dumbie', elite:'Elite', tactician:'Tactician', grandmaster:'Grandmaster', legendary:'Legendary' }[aiDifficulty.value] || aiDifficulty.value;
        title = humanWon ? "VICTORY" : w === 2 ? "DEFEAT" : "DRAW";
        tone = humanWon ? "victory" : w === 2 ? "bad" : "good";
        const scoreMsg = `Round ${aiRound.value}  ·  You ${aiScore.p1} – ${aiScore.p2} AI\nDifficulty: ${diffLabel}`;
        showModal({
          title,
          message: `${winnerMessage(w ?? "?")} \n${scoreMsg}`,
          tone,
          actions: [
            { label: "Next Round", tone: "primary", onClick: () => { closeModal(); nextAiRound(); } },
            { label: "Main Menu", tone: "soft", onClick: () => { screen.value = 'mode'; } },
          ],
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
            { label: "Play Again", tone: "primary", onClick: requestPlayAgain },
            { label: "Main Menu", tone: "soft", onClick: () => stopAndExitToMenu("") },
          ]
        : [{ label: "Play Again", tone: "primary", onClick: onResetClick }],
    });
  }
);

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
    const me = getGuestId();
    // Your own waiting private lobbies (so you can re-enter / copy code)
    const q = [
      "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
      "status=eq.waiting",
      "is_private=eq.true",
      `host_id=eq.${encodeURIComponent(me)}`,
      "order=updated_at.desc",
      "limit=20",
    ].join("&");

    const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
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

  try {
    showModal({ title: "Creating Lobby...", tone: "info", message: "Setting up your room..." });

    const created = await sbCreateLobby({
      isPrivate: quick.isPrivate,
      lobbyName: nm,
      extraStateMeta: { timerMinutes: Number(timerMinutes) || 3 },
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

    startPollingLobby(created.id, "host");
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

    const waitUntil = Date.now() + 60_000;
    while (!cancelled && Date.now() < waitUntil) {
      updateModal();

      // Check if someone joined.
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
  return await sbPatchStateWithVersionGuard(fresh.id, fresh.version, {
    state: st,
    version: nextVersion,
    updated_at: new Date().toISOString(),
  });
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
      screen.value = "mode";
      showModal({
        title: "Match Cancelled",
        tone: "bad",
        message: msg,
        actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "mode") }],
      });
    }
  }

  return ok;
}


async function sbQuickMatch() {
  // Quick Match rooms are hidden from the lobby browser by lobby_name="__QM__"
  const me = getGuestId();

  // 1) Try to claim the oldest waiting quickmatch room
  const q = [
    "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
    "status=eq.waiting",
    "is_private=eq.false",
    "guest_id=is.null",
    "mode=eq.quick",
    "order=updated_at.asc",
    "limit=6",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
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

    // ✅ If a previous quick match already ended/terminated, don't ever reuse it.
    const phase = lobby?.state?.game?.phase;
    const term = lobby?.state?.meta?.terminateReason;
    if (phase === "gameover" || term) {
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
  const created = await sbCreateLobby({
    isPrivate: false,
    lobbyName: "__QM__",
    mode: "quick",
    extraStateMeta: { kind: "quickmatch", hidden: true },
  });

  if (!created?.id) throw new Error("Failed to create quick match lobby.");
  return { lobby: created, role: "host" };
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
  if (["lobby", "settings", "credits", "ranked"].includes(screen.value)) {
    screen.value = "mode";
    return;
  }
  if (screen.value === "mode") {
    screen.value = "auth";
    return;
  }
  // In-game back is handled by dedicated buttons (Main Menu / Reset) to avoid desync.
}

async function goAuth() {
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
        screen.value = "auth";
      },
    });
  }

  if (isOnline.value) await leaveOnlineLobby("main_menu");
  stopPolling();
  myPlayer.value = null;
  screen.value = "auth";
}

async function goMode() {
  if (isOnline.value) await leaveOnlineLobby("back_to_modes");
  stopPolling();
  myPlayer.value = null;
  screen.value = "mode";
}

function playAsGuest() {
  loggedIn.value = false;
  screen.value = "mode";
}

function goQuick() { return goLobby(); }

function goRanked() {
  if (!loggedIn.value) return;
  screen.value = "ranked";
}

function startCouchPlay() {
  stopPolling();
  myPlayer.value = null;
  screen.value = "couch";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  tryPlayGameBgm();
}

// ── AI Difficulty state ────────────────────────────────────────────
// 'dumbie' | 'elite' | 'tactician' | 'grandmaster' | 'legendary'
const aiDifficulty = ref('dumbie');

// aiPlayer: which player number the AI controls (1 for grandmaster+, 2 for others)
const aiPlayer = ref(2);
const humanPlayer = computed(() => aiPlayer.value === 2 ? 1 : 2);

// Unlock tracking via localStorage
const UNLOCK_KEY = 'pb_ai_unlocks_v2';
const AI_RANK_ORDER = ['dumbie', 'elite', 'tactician', 'grandmaster', 'legendary'];

function loadUnlocks() {
  try {
    const raw = localStorage.getItem(UNLOCK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { dumbie: true, elite: false, tactician: false, grandmaster: false, legendary: false };
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
}

function closeUnlockAnim() {
  unlockAnim.active = false;
  unlockAnim.rank = '';
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
  aiPlayer.value = (diff === 'grandmaster' || diff === 'legendary') ? 1 : 2;
  aiRound.value = 1;
  aiScore.p1 = 0;
  aiScore.p2 = 0;
  stopPolling();
  myPlayer.value = null;
  screen.value = "ai";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
  tryPlayGameBgm();
}

function nextAiRound() {
  aiRound.value++;
  // Keep aiPlayer consistent with current difficulty
  aiPlayer.value = (aiDifficulty.value === 'grandmaster' || aiDifficulty.value === 'legendary') ? 1 : 2;
  myPlayer.value = null;
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
}

/* =========================
   ✅ AI ENGINE (Practice vs AI)
   Player 1 = Human | Player 2 = Computer
   Four difficulty levels: easy / normal / hard / master
========================= */

let _aiTimer = null;

function _cancelAiTimer() {
  if (_aiTimer) { clearTimeout(_aiTimer); _aiTimer = null; }
}

// ── Shared helper: collect ALL valid placements for AI ──
function _getAllValidMoves() {
  const { boardW, boardH, board, placedCount, allowFlip: af, remaining } = game;
  const ap = aiPlayer.value;
  const pieces = [...(remaining[ap] || [])];
  const flipOptions = af ? [false, true] : [false];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const moves = [];

  for (const pk of pieces) {
    const baseCells = PENTOMINOES[pk];
    const seenOrients = new Set();

    for (const flip of flipOptions) {
      for (let rot = 0; rot < 4; rot++) {
        const shape = transformCells(baseCells, rot, flip);
        const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
        if (seenOrients.has(oKey)) continue;
        seenOrients.add(oKey);

        for (let ay = 0; ay < boardH; ay++) {
          for (let ax = 0; ax < boardW; ax++) {
            let valid = true;
            const abs = [];
            for (const [dx, dy] of shape) {
              const x = ax + dx, y = ay + dy;
              if (x < 0 || y < 0 || x >= boardW || y >= boardH || board[y][x] !== null) {
                valid = false; break;
              }
              abs.push([x, y]);
            }
            if (!valid) continue;

            if (placedCount > 0) {
              let touches = false;
              outer: for (const [x, y] of abs) {
                for (const [ox, oy] of dirs) {
                  const nx = x+ox, ny = y+oy;
                  if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && board[ny][nx] !== null) {
                    touches = true; break outer;
                  }
                }
              }
              if (!touches) continue;
            }

            moves.push({ pk, rot, flip, ax, ay, abs });
          }
        }
      }
    }
  }
  return moves;
}

// ── EASY: almost pure random, barely strategic ────────────────────
function _aiMovesEasy(moves) {
  if (!moves.length) return null;
  if (Math.random() < 0.80) return moves[Math.floor(Math.random() * moves.length)];
  const { board, boardW, boardH } = game;
  let best = null, bestScore = -Infinity;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const m of moves) {
    let score = Math.random() * 2;
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of dirs) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        if (board[ny][nx]?.player === 2) score += 1;
      }
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ── NORMAL: grow own territory, light pressure, some randomness ───
function _aiMovesNormal(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH } = game;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    let score = Math.random() * 0.5;
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of dirs) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        const cell = board[ny][nx];
        if (cell?.player === 2) score += 2.0;
        if (cell?.player === 1) score += 0.8;
      }
      if (x > 0 && x < boardW-1 && y > 0 && y < boardH-1) score += 0.15;
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ── SHARED AI UTILITIES ──────────────────────────────────────────────

// Parity imbalance of a set of cells — a region that can't be tiled by pentominoes
// if the imbalance is odd (pentominoes always cover 2B+3W or 3B+2W, net ±1)
function _parityImbalance(cells) {
  let b = 0, w = 0;
  for (const [x, y] of cells) (x + y) % 2 === 0 ? b++ : w++;
  return Math.abs(b - w);
}

// Flood-fill all empty regions on simBoard
function _floodFillRegions(simBoard, boardW, boardH) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const visited = new Set();
  const regions = [];
  for (let y = 0; y < boardH; y++) {
    for (let x = 0; x < boardW; x++) {
      const k = y * boardW + x;
      if (simBoard[y][x] !== null || visited.has(k)) continue;
      const region = [];
      const q = [[x, y]];
      visited.add(k);
      while (q.length) {
        const [cx, cy] = q.shift();
        region.push([cx, cy]);
        for (const [ox, oy] of dirs) {
          const nx = cx+ox, ny = cy+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          const nk = ny * boardW + nx;
          if (simBoard[ny][nx] === null && !visited.has(nk)) {
            visited.add(nk); q.push([nx, ny]);
          }
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

// Reachable empty cells connected to player's territory
function _reachableFrom(simBoard, boardW, boardH, player) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const visited = new Set();
  const q = [];
  for (let y = 0; y < boardH; y++)
    for (let x = 0; x < boardW; x++)
      if (simBoard[y][x]?.player === player) {
        const k = y * boardW + x;
        if (!visited.has(k)) { visited.add(k); q.push([x, y]); }
      }
  let count = 0;
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [ox, oy] of dirs) {
      const nx = cx+ox, ny = cy+oy;
      if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
      const k = ny * boardW + nx;
      if (visited.has(k)) continue;
      visited.add(k);
      if (simBoard[ny][nx] === null) { count++; q.push([nx, ny]); }
      else if (simBoard[ny][nx]?.player === player) q.push([nx, ny]);
    }
  }
  return count;
}

// Score parity trap bonus: reward regions near opponent that are parity-broken
function _parityTrapBonus(regions, simBoard, boardW, boardH, hp) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  let bonus = 0;
  for (const reg of regions) {
    const imbalance = _parityImbalance(reg);
    if (imbalance === 0) continue; // balanced, might be tileable
    // Check if adjacent to human territory
    let touchesHuman = false;
    for (const [cx, cy] of reg) {
      for (const [ox, oy] of dirs) {
        const nx = cx+ox, ny = cy+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        if (simBoard[ny][nx]?.player === hp) { touchesHuman = true; break; }
      }
      if (touchesHuman) break;
    }
    if (!touchesHuman) continue;
    // Parity-broken region near human = human wastes pieces there
    // Bigger bonus for odd-imbalance that can't be resolved by any combo
    if (imbalance % 2 === 1) bonus += imbalance * 5.0;
    else bonus += imbalance * 2.0;
    // Small locked regions (1-4) are extra bad for opponent
    if (reg.length <= 4) bonus += (5 - reg.length) * 6.0;
  }
  return bonus;
}

// Zone claiming bonus: reward placing into a clean 2×5 or 5×2 corridor
function _zoneClaimBonus(abs, simBoard, boardW, boardH) {
  let bonus = 0;
  // Check several rectangular zones covering the piece cells
  for (const [px, py] of abs) {
    // Try 2×5 and 5×2 windows anchored near each piece cell
    const zones = [
      // w=5, h=2
      ...Array.from({length: 5}, (_, i) => ({x: px - i, y: py, w: 5, h: 2})),
      ...Array.from({length: 2}, (_, i) => ({x: px - i, y: py - 1, w: 5, h: 2})),
      // w=2, h=5
      ...Array.from({length: 2}, (_, i) => ({x: px - i, y: py, w: 2, h: 5})),
      ...Array.from({length: 5}, (_, i) => ({x: px, y: py - i, w: 2, h: 5})),
    ];
    for (const {x: zx, y: zy, w: zw, h: zh} of zones) {
      if (zx < 0 || zy < 0 || zx + zw > boardW || zy + zh > boardH) continue;
      // Check if zone is entirely empty or belongs to AI
      let allClear = true;
      let emptyCount = 0;
      for (let dy = 0; dy < zh && allClear; dy++) {
        for (let dx = 0; dx < zw && allClear; dx++) {
          const cell = simBoard[zy + dy][zx + dx];
          if (cell === null) emptyCount++;
          else if (cell.player !== undefined) allClear = false; // human piece blocks zone
          // AI piece in zone is fine (we're building toward it)
        }
      }
      if (allClear && emptyCount >= 5) {
        // Bonus proportional to how much of the zone our piece occupies
        const pieceInZone = abs.filter(([ax, ay]) =>
          ax >= zx && ax < zx + zw && ay >= zy && ay < zy + zh).length;
        bonus += pieceInZone * 1.8;
      }
    }
  }
  return Math.min(bonus, 15.0); // cap so it doesn't dominate
}

// Count feasible pieces for a player — how many of their remaining pieces have ≥1 valid placement
function _countFeasiblePieces(simBoard, boardW, boardH, playerNum) {
  const { remaining, allowFlip: af } = game;
  const pieces = remaining[playerNum] || [];
  const flipOptions = af ? [false, true] : [false];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const { placedCount } = game;
  let feasible = 0;

  outer: for (const pk of pieces) {
    const baseCells = PENTOMINOES[pk];
    const seenOrients = new Set();
    for (const flip of flipOptions) {
      for (let rot = 0; rot < 4; rot++) {
        const shape = transformCells(baseCells, rot, flip);
        const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
        if (seenOrients.has(oKey)) continue;
        seenOrients.add(oKey);
        for (let ay = 0; ay < boardH; ay++) {
          for (let ax = 0; ax < boardW; ax++) {
            let valid = true;
            const abs = [];
            for (const [dx, dy] of shape) {
              const x = ax + dx, y = ay + dy;
              if (x < 0 || y < 0 || x >= boardW || y >= boardH || simBoard[y][x] !== null) {
                valid = false; break;
              }
              abs.push([x, y]);
            }
            if (!valid) continue;
            if (placedCount > 0) {
              let touches = false;
              touchLoop: for (const [x, y] of abs) {
                for (const [ox, oy] of dirs) {
                  const nx = x+ox, ny = y+oy;
                  if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && simBoard[ny][nx] !== null) {
                    touches = true; break touchLoop;
                  }
                }
              }
              if (!touches) continue;
            }
            feasible++;
            continue outer; // found one valid placement — piece is feasible
          }
        }
      }
    }
  }
  return feasible;
}

// ── TACTICIAN: pattern-based blocking + parity traps ───────────────
function _aiMovesTactician(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH } = game;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const ap = aiPlayer.value;
  const hp = humanPlayer.value;
  let best = null, bestScore = -Infinity;

  for (const m of moves) {
    let score = Math.random() * 0.10;
    const simBoard = board.map(r => [...r]);
    for (const [x, y] of m.abs) simBoard[y][x] = { player: ap, pieceKey: m.pk };

    // Reward adjacency to own pieces
    let ownAdj = 0, oppAdj = 0;
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of dirs) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        const cell = board[ny][nx];
        if (cell?.player === ap) ownAdj++;
        if (cell?.player === hp) oppAdj++;
      }
      for (const [ox, oy] of diag) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        if (board[ny][nx]?.player === ap) score += 0.30;
      }
      const edgeDist = Math.min(x, boardW-1-x, y, boardH-1-y);
      score += edgeDist * 0.25; // prefer interior
    }
    score += ownAdj * 3.0; // strongly reward compactness
    score += oppAdj * 2.2; // block opponent

    // Parity trap analysis — find regions near opponent that are imbalanced
    const regions = _floodFillRegions(simBoard, boardW, boardH);
    score += _parityTrapBonus(regions, simBoard, boardW, boardH, hp);

    // Penalize leaving large open doors for opponent
    let openAdj = 0;
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of dirs) {
        const nx = x+ox, ny = y+oy;
        if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && simBoard[ny][nx] === null) openAdj++;
      }
    }
    score += openAdj * 0.3;

    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ── GRANDMASTER: territorial god — zone claiming + parity traps ─────
// Plays as P1, aggressively builds rectangle combos and poisons human territory
function _aiMovesGrandmaster(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining } = game;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const ap = aiPlayer.value;
  const hp = humanPlayer.value;
  const humanPieceCount = (remaining[hp] || []).length;

  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const simBoard = board.map(r => [...r]);
    for (const [x, y] of m.abs) simBoard[y][x] = { player: ap, pieceKey: m.pk };

    const ownSpace = _reachableFrom(simBoard, boardW, boardH, ap);
    const oppSpace = _reachableFrom(simBoard, boardW, boardH, hp);

    // Core territory control
    let score = ownSpace * 6.0 - oppSpace * 5.5;

    // Flood-fill regions for analysis
    const regions = _floodFillRegions(simBoard, boardW, boardH);

    // Parity trap bonus — poison human regions
    score += _parityTrapBonus(regions, simBoard, boardW, boardH, hp);

    // Region size analysis
    let lockedPenalty = 0;
    for (const reg of regions) {
      if (reg.length <= 4) score += (5 - reg.length) * 8.0; // locked cell bonus
      if (reg.length % 5 === 0) score -= 1.5; // clean multiple — good for human
      if (reg.length === 5 * humanPieceCount) lockedPenalty += 3.0;
    }
    score -= lockedPenalty;

    // Zone claiming — reward building toward clean rectangles
    score += _zoneClaimBonus(m.abs, simBoard, boardW, boardH);

    // Adjacency bonuses
    let oppAdj = 0, ownAdj = 0;
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of dirs) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        const cell = board[ny][nx];
        if (cell?.player === hp) oppAdj++;
        if (cell?.player === ap) ownAdj++;
      }
      const cx2 = Math.abs(x - boardW/2), cy2 = Math.abs(y - boardH/2);
      score -= (cx2 + cy2) * 0.12; // prefer center
    }
    score += oppAdj * 4.0 + ownAdj * 2.0;

    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ── LEGENDARY: reads human picks, feasibility count, parity denial ──
// Plays as P1 — zero randomness, full board analysis, piece feasibility tracking
function _aiMovesLegendary(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining } = game;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const ap = aiPlayer.value;
  const hp = humanPlayer.value;

  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const simBoard = board.map(r => [...r]);
    for (const [x, y] of m.abs) simBoard[y][x] = { player: ap, pieceKey: m.pk };

    const ownSpace = _reachableFrom(simBoard, boardW, boardH, ap);
    const oppSpace = _reachableFrom(simBoard, boardW, boardH, hp);

    // Feasibility count — true measure of piece mobility
    const ownFeasible = _countFeasiblePieces(simBoard, boardW, boardH, ap);
    const oppFeasible = _countFeasiblePieces(simBoard, boardW, boardH, hp);

    // Parity traps — maximize damage to opponent's tileable space
    const regions = _floodFillRegions(simBoard, boardW, boardH);
    const trapBonus = _parityTrapBonus(regions, simBoard, boardW, boardH, hp);

    // Zone claiming — build toward tight rectangles
    const zoneBonus = _zoneClaimBonus(m.abs, simBoard, boardW, boardH);

    // Region locking analysis
    let lockBonus = 0;
    for (const reg of regions) {
      if (reg.length <= 4) lockBonus += (5 - reg.length) * 5.0;
      if (reg.length === 5) lockBonus -= 1.5; // clean pentomino slot — bad
    }

    // Legendary score formula — feasibility dominates
    let score = ownFeasible * 8.0 - oppFeasible * 10.0
      + trapBonus
      + zoneBonus
      + lockBonus
      + ownSpace * 3.0 - oppSpace * 2.5;

    // Adjacency pressure — never random
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of dirs) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        const cell = board[ny][nx];
        if (cell?.player === hp) score += 3.5;
        if (cell?.player === ap) score += 2.0;
      }
      const cx = Math.abs(x - boardW/2), cy = Math.abs(y - boardH/2);
      score -= (cx + cy) * 0.08;
    }

    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ── Draft pickers per difficulty ──────────────────────────────────
const _VERSATILE_PIECES = new Set(['I','L','T','Y','N','S','Z','P']);
// Pieces that are harder to place (irregular shapes) — good to pick to deny human
const _TRICKY_PIECES = new Set(['F','W','X','U','V']);
// Piece shape scores for territory control
const SHAPE_SCORE = { I:5, L:5, Y:5, N:4, T:4, S:4, Z:4, P:3, W:3, F:2, U:2, X:1, V:2 };

// Synergy pairs: two pieces whose union can tile a clean 2×5 rectangle
// If human picks one, the other is the combo-completing partner they want
const SYNERGY_PAIRS = {
  P: ['Z','S','L','N'],
  Z: ['P','S'],
  S: ['P','Z'],
  L: ['P','N'],
  N: ['P','L'],
  I: ['I','L','Y','N','S','Z'],
  T: ['Y'],
  Y: ['T','N'],
};

function _getSynergyTargets(humanPicks, pool) {
  // Returns pool pieces that complete combos with any human pick
  const targets = new Set();
  for (const hk of humanPicks) {
    const partners = SYNERGY_PAIRS[hk] || [];
    for (const p of partners) {
      if (pool.includes(p)) targets.add(p);
    }
  }
  return [...targets];
}

function _aiDraftPick() {
  const pool = [...game.pool];
  if (!pool.length) return null;
  const diff = aiDifficulty.value;
  const hp = humanPlayer.value;
  const humanPicks = game.picks[hp] || [];

  if (diff === 'dumbie') {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (diff === 'elite') {
    if (Math.random() < 0.5) return pool[Math.floor(Math.random() * pool.length)];
    const good = pool.filter(k => _VERSATILE_PIECES.has(k));
    return good.length ? good[Math.floor(Math.random() * good.length)] : pool[Math.floor(Math.random() * pool.length)];
  }
  if (diff === 'tactician') {
    // SYNERGY DENIAL: if human picked something with a partner still in pool, steal it
    const synergyTargets = _getSynergyTargets(humanPicks, pool);
    if (synergyTargets.length && Math.random() < 0.85) {
      return synergyTargets[Math.floor(Math.random() * synergyTargets.length)];
    }
    // Otherwise take versatile pieces
    const good = pool.filter(k => _VERSATILE_PIECES.has(k));
    if (good.length && Math.random() < 0.80) {
      return good[Math.floor(Math.random() * good.length)];
    }
    const tricky = pool.filter(k => _TRICKY_PIECES.has(k));
    if (tricky.length && Math.random() < 0.55) {
      return tricky[Math.floor(Math.random() * tricky.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (diff === 'grandmaster') {
    // SYNERGY DENIAL: steal human's combo partners first
    const synergyTargets = _getSynergyTargets(humanPicks, pool);
    if (synergyTargets.length) {
      // Pick the synergy target with highest shape score
      let best = synergyTargets[0], bestS = -1;
      for (const k of synergyTargets) {
        const s = (SHAPE_SCORE[k] || 2) + Math.random() * 0.1;
        if (s > bestS) { bestS = s; best = k; }
      }
      return best;
    }
    // PERSONAL SYNERGY: pick pieces that form internal pairs with own picks
    const ap = aiPlayer.value;
    const aiPicks = game.picks[ap] || [];
    const ownSynergyTargets = _getSynergyTargets(aiPicks, pool);
    if (ownSynergyTargets.length) {
      let best = ownSynergyTargets[0], bestS = -1;
      for (const k of ownSynergyTargets) {
        const s = (SHAPE_SCORE[k] || 2) + Math.random() * 0.1;
        if (s > bestS) { bestS = s; best = k; }
      }
      return best;
    }
    // Fallback: highest shape score piece
    const noise = 0.15;
    let bestPick = pool[0], bestScore = -1;
    for (const k of pool) {
      const s = (SHAPE_SCORE[k] || 2) + Math.random() * noise;
      if (s > bestScore) { bestScore = s; bestPick = k; }
    }
    return bestPick;
  }
  // ── LEGENDARY: full counter-draft ──────────────────────────────────
  // Track all human picks, deny every combo chain, push unpairables to human
  {
    // Unpairable pieces (X, W, F, U) are hard to place — deny these last
    // so the human ends up with them
    const unpairables = new Set(['X','W','F','U']);

    // SYNERGY DENIAL: steal all remaining combo partners for human's pieces
    const synergyTargets = _getSynergyTargets(humanPicks, pool);
    if (synergyTargets.length) {
      // Take the highest-value synergy target
      let best = synergyTargets[0], bestS = -1;
      for (const k of synergyTargets) {
        const s = (SHAPE_SCORE[k] || 2) * 2.0 + (unpairables.has(k) ? -5 : 0);
        if (s > bestS) { bestS = s; best = k; }
      }
      return best;
    }

    // Score every piece in pool
    const humanHasLong = humanPicks.some(k => ['I','L','Y','N'].includes(k));
    const humanHasBranchy = humanPicks.some(k => ['T','F','Y','X'].includes(k));

    let bestPick = pool[0], bestS2 = -1;
    for (const k of pool) {
      let s = (SHAPE_SCORE[k] || 2) * 2.0;
      // Deny useful pieces; deprioritize unpairables (leave them for human)
      if (unpairables.has(k)) s -= 4.0;
      if (humanHasLong && ['T','F','X','W','U'].includes(k)) s += 1.0;
      if (humanHasBranchy && ['I','L','P'].includes(k)) s += 2.5;
      if (_VERSATILE_PIECES.has(k)) s += 2.5;
      if (s > bestS2) { bestS2 = s; bestPick = k; }
    }
    return bestPick;
  }
}

// ── Main AI move dispatcher ───────────────────────────────────────
function _doAiMove() {
  if (screen.value !== 'ai') return;
  if (game.phase === 'gameover') return;
  const ap = aiPlayer.value;

  if (game.phase === 'draft' && game.draftTurn === ap) {
    const pick = _aiDraftPick();
    if (pick) game.draftPick(pick);
    return;
  }

  if (game.phase === 'place' && game.currentPlayer === ap) {
    const moves = _getAllValidMoves();
    if (!moves.length) return;
    const diff = aiDifficulty.value;
    let move;
    if      (diff === 'dumbie')      move = _aiMovesEasy(moves);
    else if (diff === 'elite')       move = _aiMovesNormal(moves);
    else if (diff === 'tactician')   move = _aiMovesTactician(moves);
    else if (diff === 'grandmaster') move = _aiMovesGrandmaster(moves);
    else                             move = _aiMovesLegendary(moves);
    if (!move) return;
    game.selectedPieceKey = move.pk;
    game.rotation = move.rot;
    game.flipped = move.flip;
    game.placeAt(move.ax, move.ay);
    game.selectedPieceKey = null;
    game.rotation = 0;
    game.flipped = false;
  }
}

// Think delay: dumbie hesitates, legendary snaps instantly
function _aiThinkDelay() {
  const diff = aiDifficulty.value;
  if (diff === 'dumbie')      return 900  + Math.random() * 900;   // 0.9–1.8s
  if (diff === 'elite')       return 550  + Math.random() * 600;   // 0.55–1.15s
  if (diff === 'tactician')   return 380  + Math.random() * 380;   // 0.38–0.76s
  if (diff === 'grandmaster') return 220  + Math.random() * 200;   // 0.22–0.42s
  /* legendary */             return 80   + Math.random() * 80;    // 0.08–0.16s — instant
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
      _aiTimer = setTimeout(_doAiMove, _aiThinkDelay());
    } else {
      _cancelAiTimer();
    }
  },
  { immediate: false }
);

function applySettings() {
  saveAudioPrefs();
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
  // Also retry on the first user interaction anywhere.
  try {
    const resumeBgm = () => {
      tryPlayMenuBgm();
    };
    window.addEventListener("pointerdown", resumeBgm, { once: true, passive: true });
    window.addEventListener("keydown", resumeBgm, { once: true });
  } catch {}

  onViewportChange();
  try { window.setTimeout(() => maybeWarnMobile(), 900); } catch {}
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("orientationchange", onViewportChange, { passive: true });

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

    // AI mode: tick the battle clock for both players (P1 human timer, P2 AI timer)
    if (screen.value === 'ai' && game.phase === 'place') {
      game.tickBattleClock(Date.now());
    }
    // Couch mode: tick the battle clock for the current player
    if (screen.value === 'couch' && game.phase === 'place') {
      game.tickBattleClock(Date.now());
    }

    if (!isOnline.value) return;
    if (!myPlayer.value) return;

    // Use server-corrected time for timeout checks to avoid false timeouts from clock drift
    const t = serverNow();
    const changed = game.checkAndApplyTimeout?.(t);
    if (changed) {
      // If a timeout just triggered, confirm against server once to avoid false timeouts
      // when the opponent placed a move right on the edge.
      const localMoveSeq = Number(game.moveSeq || 0);
      (async () => {
        const ok = await confirmTimeoutWithServer(localMoveSeq);
        if (!ok) return;
        online.localDirty = true;
        pushMyState("timeout");
      })();
    }
  }, 250);
});

onBeforeUnmount(() => {
  if (originalAlert) window.alert = originalAlert;
  if (tickTimer) window.clearInterval(tickTimer);
  _cancelAiTimer();
  try { window.removeEventListener("resize", onViewportChange); } catch {}
  try { window.removeEventListener("orientationchange", onViewportChange); } catch {}
  try { if (escHandler) window.removeEventListener("keydown", escHandler); } catch {}
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
  /* Bottom bar is fixed; we only need extra padding so content never hides behind it.
     Avoid min-height hacks that can cause scrollbars to "pulse" on some browsers. */
  padding-bottom: 62px;
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

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
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
  width: 44px;
  height: 44px;
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
  width: 26px;
  height: 26px;
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

/* In-game: lock the canvas; UI already fits the viewport. */
.app.inGame .main{ overflow: hidden; }

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
  opacity: 0.82;
  filter:
    drop-shadow(0 10px 26px rgba(0,0,0,0.65))
    drop-shadow(0 0 10px rgba(255,255,255,0.10));
  will-change: left, top;
}

.cursorGhostBlock {
  border-radius: 9px;
  border: 1px solid rgba(0,0,0,0.55);
  box-shadow:
    0 14px 22px rgba(0,0,0,0.50),
    0 0 14px rgba(255,255,255,0.07),
    inset 0 1px 0 rgba(255,255,255,0.26),
    inset 0 -6px 0 rgba(0,0,0,0.34);
  overflow: hidden;
  position: relative;
}

.cursorGhostBlock::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.26),
    rgba(255,255,255,0.08) 35%,
    rgba(0,0,0,0.12)
  );
  pointer-events: none;
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
    radial-gradient(ellipse 120% 80% at 50% 0%, rgba(0,229,255,0.08), transparent 60%),
    radial-gradient(ellipse 80% 120% at 80% 100%, rgba(180,50,255,0.10), transparent 60%),
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
  background: radial-gradient(ellipse 60% 80% at 50% 0%, rgba(0,229,255,0.18), transparent 70%);
  filter: blur(20px);
  pointer-events: none;
}
.vsAiTitle{
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
.unlockRankDesc{
  font-size: 13px;
  opacity: .55;
  letter-spacing: 1px;
  animation: unlockFadeUp .4s ease-out .42s both;
}
.unlockTap{
  font-size: 11px;
  letter-spacing: 2px;
  opacity: .3;
  margin-top: 12px;
  text-transform: uppercase;
  animation: unlockFadeUp .4s ease-out .55s both, unlockTapPulse 2s ease-in-out 1s infinite alternate;
}
@keyframes unlockFadeUp{
  from{ transform: translateY(12px); opacity: 0; }
  to{ transform: translateY(0); opacity: 1; }
}
@keyframes unlockTapPulse{
  from{ opacity: .2; }
  to{ opacity: .5; }
}

/* Fit-to-viewport in-game (no scroll): keep the whole layout within the main area */
.gameLayout{
  display:grid;
  grid-template-columns: 420px 1fr;
  gap: 14px;
  height: 100%;
  min-height: 0;
  align-items: stretch;
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
  overflow: hidden;
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
}
.turnBanner.tbP1 .tbMain{ color: rgba(0,229,255,0.95); }
.turnBanner.tbP2 .tbMain{ color: rgba(255,64,96,0.95); }
.turnBanner.tbEnd .tbMain{ color: rgba(255,255,255,0.7); font-size: 18px; }
.tbPlayerNum{
  font-size: 26px;
  font-weight: 900;
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
.hudControlsHint{
  margin-left: auto;
  font-size: 11px;
  font-weight: 800;
  opacity: .45;
  white-space: nowrap;
}
.hudAiScore{
  margin-left: auto;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  opacity: .65;
  white-space: nowrap;
  color: rgba(255,220,60,0.9);
}



.hudGrid{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
@media (max-width: 920px){ .hudGrid{ grid-template-columns: 1fr; } }


.statLabel{ font-size: 11px; opacity: .72; font-weight: 900; letter-spacing: 1.2px; }
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
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  transition: border-color .2s;
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

</style>