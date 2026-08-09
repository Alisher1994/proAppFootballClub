/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/bracketry@1.1.3/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const W=(e,r)=>{console.warn(`Incorrect data. %c${e}`,"padding: 0 5px; color: #b90000; background: #ffff81",r)},D=e=>{if(!e.length)return{have_errors:!1,have_critical_error:!1};const r=e.find((o=>o.is_critical));return r?(W(r.message,r.data||""),{have_errors:!0,have_critical_error:!0}):(W(e[0].message,e[0].data||""),{have_errors:!0,have_critical_error:!1})},P=(e,r=300)=>{let o;return(...t)=>{clearTimeout(o),o=setTimeout((()=>{e.apply(void 0,t)}),r)}},he=(e,r)=>{let o=!0,t=null;return function n(){var i=this;o?(o=!1,setTimeout((function(){o=!0,t&&n.apply(i)}),r),t?(e.apply(this,t),t=null):e.apply(this,arguments)):t=arguments}},j=(e,r,o)=>Math.max(Math.min(e,o),r),_=e=>typeof e=="object"&&!Array.isArray(e)&&e!==null,S=e=>typeof e=="number"&&!isNaN(e),E=e=>{if(typeof e!="string")return console.warn("create_element_from_Html expects an html string, instead got: ",e),document.createElement("div");const r=document.createElement("div");return r.innerHTML=e.trim(),r.firstElementChild?r.firstElementChild:(console.warn(`create_element_from_Html: failed to create an element from string: "${e}"`),document.createElement("div"))},G=(e,r)=>Array.from(Array(e)).map(((o,t)=>r(t))),V=(e,r)=>{for(let o=0;o<e;o++)r()},ve=(e,r,o)=>{const t=document.head.querySelector(`#${e}-${r}`);t&&document.head.removeChild(t),((n,i,a)=>{document.head.insertAdjacentHTML("beforeend",`<style id='${n}-${i}'>${a}</style>`)})(e,r,o)},L=e=>{if(e===null||typeof e!="object")return e;let r=new e.constructor;for(let o in e)e.hasOwnProperty(o)&&(r[o]=L(e[o]));return r},U=(e,r)=>{const o=[];return e===void 0||Array.isArray(e)||o.push({is_critical:!0,message:"data.matches must be an array:",data:e}),e&&e.length&&e.forEach((t=>{_(t)||o.push({is_critical:!0,message:"Match must be an object:",data:t}),S(t.roundIndex)||o.push({is_critical:!1,message:'Match must contain a numeric "roundIndex" prop:',data:t}),S(t.order)||o.push({is_critical:!1,message:'Match must contain a numeric "order" prop:',data:t}),t.sides===void 0||Array.isArray(t.sides)||o.push({is_critical:!0,message:"Match.sides is required and must be an array",data:t}),Array.isArray(t.sides)&&t.sides.forEach((n=>{_(n)?(n.contestantId!==void 0&&typeof n.contestantId!="string"&&o.push({is_critical:!0,message:"If you provide side.contestantId, it must be a string",data:n}),typeof n.contestantId!="string"||Object.keys(r||{}).includes(n.contestantId)||o.push({is_critical:!1,message:"No contestant data found for this side.contestantId:",data:n}),n.isWinner!==void 0&&typeof n.isWinner!="boolean"&&o.push({is_critical:!1,message:"If you provide side.isWinner, it must be a boolean",data:n}),n.scores===void 0||Array.isArray(n.scores)||o.push({is_critical:!0,message:"If side.scores is provided, it must be an array",data:n}),Array.isArray(n.scores)&&!n.scores.length&&o.push({is_critical:!1,message:"side.scores is provided but it's an empty array: ",data:n}),Array.isArray(n.scores)&&n.scores.forEach((i=>{o.push(...((a,s)=>{const l=[];return _(a)?(a.mainScore===void 0&&l.push({is_critical:!1,message:'Score must contain a "mainScore" property',data:s}),S(a.mainScore)||typeof a.mainScore=="string"||l.push({is_critical:!1,message:"mainScore must be a number or a string",data:s}),a.subscore===void 0||S(a.subscore)||typeof a.subscore=="string"||l.push({is_critical:!1,message:'If you provide "subscore", it must be a number or a string',data:s}),typeof a.isWinner!="boolean"&&a.isWinner!==void 0&&l.push({is_critical:!1,message:'If you provide "isWinner", it must be a boolean',data:s})):l.push({is_critical:!1,message:"Score must be an object",data:s}),l})(i,n))})),n.currentScore===void 0||S(n.currentScore)||typeof n.currentScore=="string"||o.push({is_critical:!1,message:"If side.currentScore is provided, it must be a number or string: ",data:n}),n.isServing!==void 0&&typeof n.isServing!="boolean"&&o.push({is_critical:!1,message:"If side.isServing is provided, it must be a boolean",data:n})):o.push({is_critical:!0,message:"Match's side must be an object",data:t})}))})),o};var me=`.bracket-root {
  
}
.bracket-root .navigation-button,
.bracket-root .scroll-button {
  justify-content: center;
  align-items: center;
  cursor: auto;
  user-select: none;
  z-index: 3;
}
.bracket-root .navigation-button.active,
.bracket-root .scroll-button.active {
  cursor: pointer;
}
.bracket-root .navigation-button.active > *,
.bracket-root .scroll-button.active > * {
  opacity: 1;
}
.bracket-root .navigation-button > *,
.bracket-root .scroll-button > * {
  opacity: 0.15;
}
.bracket-root .navigation-button {
  display: grid;
}
.bracket-root .navigation-button.left {
  grid-column: 1;
}
.bracket-root .navigation-button.right {
  grid-column: 5;
}
.bracket-root .navigation-button.hidden {
  display: none;
}
.bracket-root svg.default-nav-icon {
  fill: var(--navButtonSvgColor);
  box-sizing: content-box;
  padding: var(--navButtonPadding, 0);
  width: var(--navButtonArrowSize);
  height: var(--navButtonArrowSize);
}
.bracket-root svg.default-scroll-icon {
  fill: var(--scrollButtonSvgColor);
  box-sizing: content-box;
  padding: var(--scrollButtonPadding, 0);
  width: var(--scrollButtonArrowSize);
  height: var(--scrollButtonArrowSize);
}
.bracket-root .scroll-button {
  grid-column: 2/span 2;
  display: none;
}
.bracket-root .scroll-button.button-up {
  grid-row: 3;
  border-bottom: 1px solid var(--scrollGutterBorderColor, var(--rootBorderColor));
}
.bracket-root .scroll-button.button-down {
  grid-row: 5;
  border-top: 1px solid var(--scrollGutterBorderColor, var(--rootBorderColor));
}
.bracket-root.with-scroll-buttons-over-matches .scroll-button {
  border: none;
  height: 0;
}
.bracket-root.with-scroll-buttons-over-matches .button-up {
  align-items: flex-start;
}
.bracket-root.with-scroll-buttons-over-matches .button-down {
  align-items: flex-end;
}
.bracket-root.with-vertical-scroll-buttons .scroll-button {
  display: flex;
}
.bracket-root.with-vertical-scroll-buttons .scrollbar.animated {
  transition: top 0.3s ease-out, height 0.3s ease-out;
}
.bracket-root.with-nav-buttons-before-titles .navigation-button {
  border-bottom: 1px solid var(--roundTitlesBorderColor, var(--rootBorderColor));
}
.bracket-root.with-nav-buttons-before-titles .navigation-button.left {
  grid-column: 2;
  justify-content: flex-start;
}
.bracket-root.with-nav-buttons-before-titles .navigation-button.right {
  grid-column: 3;
  justify-content: flex-end;
}
.bracket-root.with-nav-buttons-over-titles .navigation-button {
  grid-row: 2;
  width: 0;
  border: none;
  position: relative;
  margin-bottom: 1px; 
}
.bracket-root.with-nav-buttons-over-titles .navigation-button.left {
  justify-content: flex-start;
}
.bracket-root.with-nav-buttons-over-titles .navigation-button.right {
  justify-content: flex-end;
}
.bracket-root.with-hidden-nav-buttons .navigation-button {
  display: none !important;
}
.bracket-root.with-gutter-nav-buttons .navigation-button {
  grid-row: 1/-1;
}
.bracket-root.with-gutter-nav-buttons .navigation-button.left {
  border-right: 1px solid var(--navGutterBorderColor, var(--rootBorderColor));
}
.bracket-root.with-gutter-nav-buttons .navigation-button.right {
  border-left: 1px solid var(--navGutterBorderColor, var(--rootBorderColor));
}
.bracket-root.with-nav-buttons-over_matches .navigation-button:not(.hidden) {
  display: flex;
  border: none;
  width: 0;
  position: relative;
  grid-row: 4;
}
.bracket-root.with-nav-buttons-over_matches .navigation-button:not(.hidden) > *:first-child {
  position: absolute;
  top: var(--navButtonsTopDistance, 50%);
  transform: translate(0, -50%);
}
.bracket-root.with-nav-buttons-over_matches .navigation-button:not(.hidden).left > *:first-child {
  left: 0;
}
.bracket-root.with-nav-buttons-over_matches .navigation-button:not(.hidden).right > *:first-child {
  right: 0;
}`,ge=`.stop-scrolling {
  height: 100%;
  overflow: hidden;
}

.bracket-root {
  display: grid;
  
  grid-template-columns: auto 1fr 1fr 0 auto;
  grid-template-rows: auto auto auto 1fr auto;
  min-width: 260px;
  min-height: 250px;
  
  max-width: 100%;
  width: var(--width);
  height: var(--height);
  text-align: left;
  border-width: 1px;
  border-style: solid;
  border-color: var(--wrapperBorderColor, var(--rootBorderColor));
  box-sizing: border-box;
  font-family: var(--rootFontFamily);
  background-color: var(--rootBgColor);
  
  
}
.bracket-root * {
  box-sizing: border-box;
  user-select: none;
  margin: 0;
  padding: 0;
  width: auto;
  height: auto;
  border: none;
  border-radius: 0;
  align-content: unset;
  align-items: unset;
  align-self: unset;
  bottom: unset;
  top: unset;
  left: unset;
  right: unset;
  box-shadow: none;
  outline: none;
  text-decoration: none;
  white-space: initial;
  line-height: initial;
}
.bracket-root .zero-width {
  width: 0;
}
.bracket-root .full-width-grid-column {
  
  grid-column: 1/-1;
}
.bracket-root .equal-width-columns-grid {
  
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
.bracket-root .round-titles-grid-item {
  
  width: 0;
  min-width: 100%;
  grid-row: 2;
  grid-column: 2/span 2;
  overflow: hidden;
  padding-bottom: 1px;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: var(--roundTitlesBorderColor, var(--rootBorderColor));
  
}
.bracket-root .round-titles-wrapper {
  height: 100%;
  min-width: 100%;
  font-size: var(--roundTitlesFontSize);
  font-family: var(--roundTitlesFontFamily, var(--rootFontFamily));
  color: var(--roundTitleColor);
}
.bracket-root .round-title {
  padding: var(--roundTitlesVerticalPadding) var(--matchHorMargin);
  display: flex;
  overflow: hidden;
  justify-content: center;
  white-space: nowrap;
}
.bracket-root .matches-scroller {
  grid-column: 2/span 2;
  grid-row: 4;
  overflow-y: hidden;
  overflow-x: hidden;
  pointer-events: none;
  
  scrollbar-width: none; 
  -ms-overflow-style: none; 
}
.bracket-root .matches-scroller::-webkit-scrollbar {
  display: none;
  
}
.bracket-root .matches-scroller.scroll-y-enabled {
  pointer-events: auto;
}
.bracket-root .matches-positioner {
  position: relative;
  z-index: 2;
  display: grid;
  min-width: 100%;
  min-height: 100%;
  grid-template-rows: 100%;
  overflow: hidden;
  padding: var(--mainVerticalPadding, 0) 0;
  font-size: var(--matchFontSize);
}
.bracket-root .scrollbar-parent {
  grid-column: 4;
  grid-row: 4;
  position: relative;
  display: none;
  z-index: 3;
}
.bracket-root .scrollbar-overflow-preventer {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: var(--scrollbarWidth);
  overflow-y: hidden;
}
.bracket-root .scrollbar {
  position: absolute;
  right: 0;
  width: 100%;
  background: var(--scrollbarColor);
}
.bracket-root.with-visible-scrollbar .scrollbar-parent {
  display: block;
}
.bracket-root.with-native-scroll .matches-scroller.scroll-y-enabled {
  overflow-y: scroll;
}
.bracket-root.with-vertical-scroll-buttons .matches-positioner.is-scrolling {
  transition: transform var(--scroll-transition-duration) ease-out;
}`,be=`.bracket-root .round-wrapper {
  position: relative;
  display: grid;
  grid-auto-rows: minmax(0, 1fr);
  align-items: stretch;
  min-width: 180px;
  max-width: 100%;
}
.bracket-root .round-wrapper:first-of-type .match-lines-area {
  
  left: var(--matchHorMargin);
}
.bracket-root .round-wrapper:last-of-type .match-lines-area {
  right: var(--matchHorMargin);
}
.bracket-root .round-wrapper.collapsed {
  visibility: hidden;
}
.bracket-root .matches-positioner.is-scrolling * {
  cursor: auto !important;
}
.bracket-root .bronze-round-wrapper {
  display: flex;
  overflow: hidden;
}
.bracket-root .bronze-round-wrapper .pseudo-round-wrapper {
  display: grid;
  grid-auto-rows: minmax(0, 1fr);
  
  z-index: 2;
}
.bracket-root .bronze-round-wrapper .pseudo-round-wrapper .match-wrapper {
  padding: 0;
}
.bracket-root .bronze-round-wrapper .pseudo-round-wrapper:first-child {
  width: calc(var(--matchHorMargin) * 1.2);
  min-width: 0;
}
.bracket-root .bronze-round-wrapper .pseudo-round-wrapper:first-child .match-wrapper {
  padding: 0;
}
.bracket-root .bronze-round-wrapper .pseudo-round-wrapper:first-child .match-wrapper .match-lines-area {
  left: 0;
  width: 100%;
}
.bracket-root .bronze-round-wrapper .pseudo-round-wrapper:first-child .match-wrapper .match-lines-area .line-wrapper {
  box-shadow: none;
}
.bracket-root .bronze-round-wrapper .round-wrapper {
  flex: 1;
}
.bracket-root .bronze-round-wrapper .round-wrapper .match-wrapper {
  padding-left: calc(var(--matchHorMargin) * 0.3);
}
.bracket-root .bronze-round-wrapper .round-wrapper .match-wrapper.even {
  align-self: end;
  padding-top: var(--matchMinVerticalGap);
  padding-bottom: var(--matchMinVerticalGap);
}
.bracket-root .bronze-round-wrapper .round-wrapper .match-wrapper.odd {
  align-self: start;
  padding-top: calc(var(--matchMinVerticalGap) + var(--matchFontSize) * 1.5);
  padding-bottom: calc(var(--matchMinVerticalGap) + var(--matchFontSize) * 1.5);
}
.bracket-root .bronze-round-wrapper .round-wrapper .match-wrapper.odd .line-wrapper.upper, .bracket-root .bronze-round-wrapper .round-wrapper .match-wrapper.even .line-wrapper.lower {
  box-shadow: calc(var(--connectionLinesWidth) * -1) 0px 0px 0px;
}
.bracket-root .bronze-round-wrapper .round-wrapper .match-wrapper.highlighted .line-wrapper {
  
  color: var(--highlightedConnectionLinesColor);
}
.bracket-root .match-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
  min-height: 40px;
  box-sizing: border-box;
  padding: calc(var(--matchMinVerticalGap) / 2) var(--matchHorMargin);
}
.bracket-root .match-wrapper.odd .line-wrapper.upper {
  box-shadow: var(--connectionLinesWidth) 0px 0px 0px;
  border-bottom: var(--connectionLinesWidth) solid var(--connectionLinesColor);
}
.bracket-root .match-wrapper.even .line-wrapper.lower {
  box-shadow: var(--connectionLinesWidth) 0px 0px 0px;
  border-top: var(--connectionLinesWidth) solid var(--connectionLinesColor);
}
.bracket-root .match-wrapper.highlighted .match-status {
  border-color: var(--highlightedConnectionLinesColor);
}
.bracket-root .match-wrapper.highlighted .match-lines-area .line-wrapper {
  
  color: var(--highlightedConnectionLinesColor);
  border-color: var(--highlightedConnectionLinesColor);
}
.bracket-root .match-wrapper.last-highlighted .match-lines-area .line-wrapper {
  color: var(--connectionLinesColor);
}
.bracket-root .match-status {
  display: flex;
  z-index: 2;
  align-self: center;
  transition: border-color 0.1s ease-out;
  font-size: calc(var(--matchFontSize) * 0.85);
  padding: calc(var(--matchFontSize) / 6) calc(var(--matchFontSize) / 2);
  margin: 0 calc(var(--matchFontSize) / 2);
  border-width: var(--connectionLinesWidth);
  border-style: solid;
  border-color: var(--connectionLinesColor);
  
  background: #fff;
  box-shadow: 0 0 0 1000px var(--matchStatusBgColor) inset;
}
.bracket-root .match-status:empty {
  display: none;
}
.bracket-root .match-body {
  display: flex;
  width: 100%;
  max-width: var(--matchMaxWidth);
  justify-content: center;
  z-index: 2;
  transition: border-color 0.1s ease-out;
  pointer-events: auto;
  border-width: var(--connectionLinesWidth, 2);
  border-style: solid;
  border-color: transparent;
  position: relative;
}
.bracket-root .match-body:empty {
  
  pointer-events: none;
}
.bracket-root .match-body .sides {
  flex: 1;
  display: grid;
  
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
  grid-row-gap: var(--connectionLinesWidth);
}
.bracket-root .match-body.live:not(:empty) {
  border-color: var(--liveMatchBorderColor, var(--rootBorderColor));
  background-color: var(--liveMatchBgColor);
}
.bracket-root .match-body.live:not(:empty) .current-score {
  border-color: var(--liveMatchBorderColor, var(--rootBorderColor));
}
.bracket-root .match-top,
.bracket-root .match-bottom {
  position: absolute;
  left: 0;
  color: #c1c1c1;
  padding-left: calc(var(--matchFontSize) / 2);
  font-size: calc(var(--matchFontSize) * 0.7);
  width: 100%;
}
.bracket-root .match-top {
  bottom: calc(100% + var(--connectionLinesWidth) + 1px);
}
.bracket-root .match-bottom {
  top: calc(100% + var(--connectionLinesWidth) + 1px);
}
.bracket-root .match-lines-area {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  z-index: 1;
}
.bracket-root .match-lines-area .line-wrapper {
  
  flex: 1;
  transition: color 0.1s ease-out, border-color 0.1s ease-out;
  
  color: var(--connectionLinesColor);
}
.bracket-root .matches-positioner > .round-wrapper:last-of-type .line-wrapper {
  
  color: transparent;
}
.bracket-root .side-wrapper {
  width: 100%;
  display: flex;
  align-items: center;
  pointer-events: auto;
  padding-top: var(--matchAxisMargin);
  padding-bottom: var(--matchAxisMargin);
  padding-right: calc(var(--matchFontSize) / 3 * 2);
  padding-left: calc(var(--matchFontSize) / 2);
  
  color: var(--matchTextColor);
}
.bracket-root .side-wrapper.empty-side, .bracket-root .side-wrapper:not([contestant-id]) {
  pointer-events: none;
}
.bracket-root .side-wrapper.highlighted .player-title {
  color: var(--highlightedPlayerTitleColor);
}
.bracket-root .side-wrapper.looser:not(.highlighted) .player-title, .bracket-root .side-wrapper .single-score-wrapper:not(.winner) {
  opacity: 0.54;
}
.bracket-root .side-wrapper:not(.winner) .winner-mark {
  display: none;
}
.bracket-root .side-info-item {
  display: grid;
  
  grid-auto-rows: minmax(0, 1fr);
  grid-template-columns: auto;
  align-items: center;
}
.bracket-root .side-info-item * {
  white-space: nowrap;
  user-select: none;
}
.bracket-root .side-info-item.serving-mark {
  width: calc(var(--matchFontSize) / 2.5);
  height: calc(var(--matchFontSize) / 2.5);
  margin-left: calc(var(--distanceBetweenScorePairs) * 0.8);
  border-radius: 50%;
  background-color: #b7cf15;
}
.bracket-root .side-info-item.serving-mark.hidden {
  display: none;
}
.bracket-root .side-info-item.serving-mark.transparent {
  opacity: 0;
}
.bracket-root .side-info-item.side-scores {
  grid-auto-flow: column;
  font-family: var(--scoreFontFamily, var(--rootFontFamily));
  grid-column-gap: var(--distanceBetweenScorePairs);
}
.bracket-root .side-info-item.current-score {
  border-width: 1px;
  border-style: solid;
  text-align: center;
  border-color: var(--matchTextColor);
  padding: 0 calc(var(--matchFontSize) / 3);
  margin-left: calc(var(--distanceBetweenScorePairs) * 0.8);
}
.bracket-root .side-info-item.current-score:empty {
  display: none;
}
.bracket-root .side-info-item.entry-status:not(:empty) {
  margin-right: calc(var(--matchFontSize) / 2);
}
.bracket-root .side-info-item.players-info {
  flex: 1;
  min-width: 0;
  grid-row-gap: var(--oneSidePlayersGap);
}
.bracket-root .side-info-item.winner-mark {
  padding-right: var(--distanceBetweenScorePairs);
}
.bracket-root .side-info-item.winner-mark svg {
  fill: var(--matchTextColor, #000000);
}
.bracket-root .player-wrapper {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.bracket-root .player-wrapper .nationality {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.bracket-root .player-wrapper .nationality:not(:empty) {
  margin-right: calc(var(--matchFontSize) / 2);
}
.bracket-root .player-wrapper .player-title {
  flex: 1;
  transition: color 0.1s ease-out, opacity 0.1s ease-out;
  text-align: left;
  text-overflow: ellipsis;
  
  min-width: 0;
  overflow: hidden;
  padding-right: calc(var(--matchFontSize) * 1.5);
  font-family: var(--playerTitleFontFamily, var(--rootFontFamily));
}
.bracket-root .single-score-wrapper {
  display: flex;
  overflow: visible;
  flex-direction: column;
  align-items: center;
}
.bracket-root .single-score-wrapper .side-own-single-score {
  display: flex;
}
.bracket-root .single-score-wrapper .opponent-single-score {
  display: flex;
  height: 0;
  overflow: hidden;
}
.bracket-root .subscore {
  padding-left: 1px;
  font-size: calc(var(--matchFontSize) / 3 * 2);
  margin-top: calc(var(--matchFontSize) / 5 * -1);
  margin-right: calc(var(--matchFontSize) / 5 * -1);
}
.bracket-root svg.default-winner-svg {
  width: auto;
  height: var(--matchFontSize);
}
.bracket-root.with-onMatchClick .match-body:not(:empty) {
  cursor: pointer;
}
.bracket-root.with-onMatchClick .match-body:not(:empty):hover {
  border-color: var(--hoveredMatchBorderColor, var(--rootBorderColor));
}
.bracket-root.with-onMatchClick .match-body:not(:empty):hover .player-title {
  color: var(--highlightedPlayerTitleColor);
}
.bracket-root.with-onMatchClick .match-body:not(:empty) * {
  
  pointer-events: none;
}
.bracket-root:not(.with-classical-layout) .round-wrapper.collapsed {
  height: 0;
  overflow: hidden;
}
.bracket-root.with-clickable-sides .side-wrapper {
  cursor: pointer;
}
.bracket-root.with-clickable-sides .side-wrapper:hover .player-title {
  color: var(--highlightedPlayerTitleColor);
}`;const H=(e,r)=>{if(typeof r!="string"&&r!==null||([...e.querySelectorAll(".side-wrapper.highlighted")].forEach((t=>t.classList.remove("highlighted"))),[...e.querySelectorAll(".match-wrapper.highlighted")].forEach((t=>t.classList.remove("highlighted"))),[...e.querySelectorAll(".match-wrapper.last-highlighted")].forEach((t=>t.classList.remove("last-highlighted"))),r===null||r===""))return;const o=[...e.querySelectorAll(`.side-wrapper[contestant-id="${r}"]`)];o.length&&(o[0].classList.contains("highlighted")||o.reverse().forEach(((t,n)=>{t.classList.add("highlighted");const i=t.closest(".match-wrapper");i.classList.add("highlighted"),n===0&&t.closest(".match-wrapper").classList.add("last-highlighted");const a=t.closest(".bronze-round-wrapper");a&&(a.querySelector(".pseudo-round-wrapper:first-child .match-wrapper")?.classList.add("highlighted"),i.classList.contains("even")?a.querySelector(".pseudo-round-wrapper:nth-child(2) .match-wrapper.even")?.classList.add("highlighted"):a.querySelector(".pseudo-round-wrapper:nth-child(2) .match-wrapper.odd")?.classList.add("highlighted"))})))},K=(e,r)=>{const o=+e.closest(".round-wrapper")?.getAttribute("round-index"),t=+e.closest(".match-wrapper")?.getAttribute("match-order");return r.matches?.find((n=>n.roundIndex===o&&n.order===t))||{roundIndex:+o,order:+t}},M={type:"function_or_null",default_value:null},fe={GENERAL_OPTIONS:{width:{type:"string",default_value:"max-content"},height:{type:"string",default_value:"100%"},rootBgColor:{type:"string",default_value:"transparent"},mainVerticalPadding:{type:"pixels",default_value:20,min_value:0},visibleRoundsCount:{type:"number",default_value:0},displayWholeRounds:{type:"boolean",default_value:!1},useClassicalLayout:{type:"boolean",default_value:!1},disableHighlight:{type:"boolean",default_value:!1}},BORDERS_OPTIONS:{rootBorderColor:{type:"string",default_value:"#bbbbbb"},wrapperBorderColor:{type:"string",default_value:""},roundTitlesBorderColor:{type:"string",default_value:""},scrollGutterBorderColor:{type:"string",default_value:""},navGutterBorderColor:{type:"string",default_value:""},liveMatchBorderColor:{type:"string",default_value:"#44c985"},hoveredMatchBorderColor:{type:"string",default_value:""}},ROUND_TITLE_OPTIONS:{getRoundTitleElement:M,roundTitlesVerticalPadding:{type:"pixels",default_value:8},roundTitleColor:{type:"string",default_value:"#000"}},NAVIGATION_OPTIONS:{navButtonsPosition:{type:"select",options:["overMatches","gutters","beforeTitles","overTitles","hidden"],default_value:"gutters"},navButtonSvgColor:{type:"string",default_value:"#161616"},navButtonArrowSize:{type:"pixels",default_value:34},navButtonPadding:{type:"string",default_value:"4px"},leftNavButtonHTML:{type:"multiline_string",default_value:'<svg class="default-nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z"/></svg>'},rightNavButtonHTML:{type:"multiline_string",default_value:'<svg class="default-nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 3l3.057-3 11.943 12-11.943 12-3.057-3 9-9z"/></svg>'},navButtonsTopDistance:{type:"string",default_value:"50%"}},SCROLL_OPTIONS:{verticalScrollMode:{type:"select",options:["native","buttons","mixed"],default_value:"native"},buttonScrollAmount:{type:"pixels",default_value:300},resetScrollOnNavigation:{type:"boolean",default_value:!1},scrollButtonsPosition:{type:"select",options:["gutters","overMatches"],default_value:"gutters"},scrollButtonSvgColor:{type:"string",default_value:"#161616"},scrollButtonArrowSize:{type:"pixels",default_value:34},scrollButtonPadding:{type:"string",default_value:"4px"},scrollUpButtonHTML:{type:"multiline_string",default_value:'<svg class="default-scroll-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 16.67l2.829 2.83 9.175-9.339 9.167 9.339 2.829-2.83-11.996-12.17z"/></svg>'},scrollDownButtonHTML:{type:"multiline_string",default_value:'<svg class="default-scroll-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 7.33l2.829-2.83 9.175 9.339 9.167-9.339 2.829 2.83-11.996 12.17z"/></svg>'},showScrollbar:{type:"boolean",default_value:!0},scrollbarWidth:{type:"pixels",default_value:5},scrollbarColor:{type:"string",default_value:"rgb(63 63 63 / 23%)"}},FONTS_OPTIONS:{rootFontFamily:{type:"string",default_value:"Open Sans, Roboto, sans-serif"},roundTitlesFontFamily:{type:"string",default_value:"inherit"},roundTitlesFontSize:{type:"pixels",default_value:22,min_value:8},matchTextColor:{type:"string",default_value:"#000"},matchFontSize:{type:"pixels",default_value:14,min_value:8},playerTitleFontFamily:{type:"string",default_value:"inherit"},highlightedPlayerTitleColor:{type:"string",default_value:"#003ae6"},scoreFontFamily:{type:"string",default_value:"inherit"}},CONNECTION_LINES_OPTIONS:{connectionLinesWidth:{type:"pixels",default_value:2,min_value:0},connectionLinesColor:{type:"string",default_value:"#dcdcdc"},highlightedConnectionLinesColor:{type:"string",default_value:"#7698ff"}},MATCH_OPTIONS:{getMatchElement:M,getMatchTopHTML:M,getMatchBottomHTML:M,getNationalityHTML:M,getEntryStatusHTML:M,getPlayerTitleHTML:M,getScoresHTML:M,matchMaxWidth:{type:"pixels",default_value:1e3},matchMinVerticalGap:{type:"pixels",default_value:25},matchHorMargin:{type:"pixels",default_value:20},matchAxisMargin:{type:"pixels",default_value:4},oneSidePlayersGap:{type:"pixels",default_value:2},liveMatchBgColor:{type:"string",default_value:"transparent"},distanceBetweenScorePairs:{type:"pixels",default_value:14,min_value:0},matchStatusBgColor:{type:"string",default_value:"#fff"}},CALLBACKS:{onMatchClick:M,onMatchSideClick:M}},A=()=>{const e={};return Object.values(fe).forEach((r=>Object.assign(e,r))),e},ye={"with-scroll-buttons-over-matches":e=>e.scrollButtonsPosition==="overMatches","with-hidden-nav-buttons":e=>e.navButtonsPosition==="hidden","with-gutter-nav-buttons":e=>e.navButtonsPosition==="gutters","with-nav-buttons-over_matches":e=>e.navButtonsPosition==="overMatches","with-nav-buttons-before-titles":e=>e.navButtonsPosition==="beforeTitles","with-nav-buttons-over-titles":e=>e.navButtonsPosition==="overTitles","with-onMatchClick":e=>typeof e.onMatchClick=="function","with-classical-layout":e=>e.useClassicalLayout===!0,"with-clickable-sides":e=>typeof e.onMatchSideClick=="function"||e.disableHighlight!==!0,"with-vertical-scroll-buttons":e=>e.verticalScrollMode==="buttons"||e.verticalScrollMode==="mixed","with-native-scroll":e=>e.verticalScrollMode==="native","with-visible-scrollbar":e=>e.showScrollbar===!0},Y=(e,r,{the_root_element:o})=>{const t=r.get_final_value;r.try_merge_options(e),((a,s)=>{a.querySelector(".navigation-button.left").innerHTML=s("leftNavButtonHTML"),a.querySelector(".navigation-button.right").innerHTML=s("rightNavButtonHTML"),a.querySelector(".button-up").innerHTML=s("scrollUpButtonHTML"),a.querySelector(".button-down").innerHTML=s("scrollDownButtonHTML")})(o,t);const n=A(),i=r.get_all_final_options();Object.entries(i).forEach((([a,s])=>{const{type:l}=n[a];if(["pixels","string"].includes(l)){let v=s;l==="pixels"&&(v=parseInt(v)+"px"),o.style.setProperty(`--${a}`,v)}})),Object.entries(ye).forEach((([a,s])=>{s(i)?o.classList.add(a):o.classList.remove(a)}))},we=(e,r)=>{console.warn(`Impossible value provided for "${e}" option: %c${JSON.stringify(r,null,2)}%c.
Default value of %c${(()=>{const o={};return Object.entries(A()).forEach((([t,{default_value:n}])=>{o[t]=n})),o})()[e]}%c will be used instead`,"background: #c7ffc9; color: black; padding: 0 3px","","background: pink; color: black; padding: 0 3px","")},_e=(e,r,o)=>o?!!((t,n)=>{switch(n.type){case"number":case"pixels":return S(t);case"multiline_string":case"string":return typeof t=="string";case"function_or_null":return typeof t=="function"||t===null;case"boolean":return typeof t=="boolean";case"select":return n.options?.find((i=>_(i)?i.value===t:i===t))}})(r,o)||(we(e,r),!1):(console.warn(`Unknown option provided: %c${e}`,"background: pink; color: black; font-weight: bold; padding: 0 3px;"),!1),J=(e,r,o)=>{const t=o[e];if(t===void 0)return void console.warn("Impossible option name passed to get_final_value: ",e);const n=r[e],i=n!==void 0?n:t.default_value;return t.type!=="number"&&t.type!=="pixels"||typeof t.min_value!="number"?i:Math.max(i,t.min_value)},I=(e,r)=>{const o=e.matches_positioner.querySelectorAll(".round-wrapper"),t=r("visibleRoundsCount");if(t!==void 0&&t>=1)return Math.min(o.length,t);{const n=e.matches_scroller.getBoundingClientRect().width/o[0].getBoundingClientRect().width;return isNaN(n)?0:r("displayWholeRounds")?Math.max(1,Math.floor(n)):n}},N=(e,r,o)=>{const t=e.matches_positioner.querySelectorAll(".round-wrapper");return r+1.01*I(e,o)>=t.length},Q=(e,r)=>e.matches_positioner.querySelectorAll(".round-wrapper").length-Math.floor(1.01*I(e,r)),ke=(e,r,o,t)=>{e.set(e.get());const n=t.get_scrollY_ratio(),i=[...o.matches_positioner.querySelectorAll(".round-wrapper")];i.forEach(((v,c)=>{const p=c>=Math.floor(e.get());v.classList[p?"remove":"add"]("collapsed")})),o.matches_positioner.style.width="max-content";const a=I(o,r),s=100/a*i.length+"%",l=-e.get()*(100/a)+"%";o.matches_positioner.style.width=s,o.matches_positioner.style.marginLeft=l,o.round_titles_wrapper.style.width=s,o.round_titles_wrapper.style.marginLeft=l,t.adjust_offset(n),((v,c,p)=>{const b=N(v,c,p),d=c===0&&b;v.the_root_element.querySelectorAll(".navigation-button.left").forEach((u=>{c>0?u.classList.add("active"):u.classList.remove("active"),d?u.classList.add("hidden"):u.classList.remove("hidden")})),v.the_root_element.querySelectorAll(".navigation-button.right").forEach((u=>{b?u.classList.remove("active"):u.classList.add("active"),d?u.classList.add("hidden"):u.classList.remove("hidden")}))})(o,e.get(),r)},xe=(e,r,o)=>{const t=((l,v)=>{let c=0;const p=b=>{c=j(b,0,Q(l,v))};return{set:p,try_decrement:()=>p(c-1),try_increment:()=>p(c+1),get:()=>c}})(e,r),n=()=>ke(t,r,e,o);n();const i=((l,v)=>{let c=!1;const p=new ResizeObserver(P((()=>{c?l.closest("html")&&v():c=!0})));return p.observe(l),p})(e.matches_scroller,n),a=()=>{t.try_decrement(),n()},s=()=>{N(e,t.get(),r)||(t.try_increment(),n())};return{move_left:a,move_right:s,set_base_round_index:l=>{t.set(l),n()},repaint:n,handle_click:l=>{l.classList.contains("active")&&(l.classList.contains("left")&&a(),l.classList.contains("right")&&s())},get_state:()=>{let l=!1,v=!1,c=0,p=0,b=0;if(Object.keys(e).length){const d=t.get();l=N(e,d,r),v=d===0&&l,c=d,b=Q(e,r),p=I(e,r)}return{lastRoundIsFullyVisible:l,allRoundsAreVisible:v,baseRoundIndex:c,maxBaseRoundIndex:b,visibleRoundsCount:p}},uninstall:()=>{i.disconnect()}}},T=e=>S(e)||typeof e=="string",X=(e,r)=>{if(!T(e?.mainScore)&&!T(r?.mainScore))return"";const o=T(e?.mainScore)?e.mainScore:"",t=T(e?.subscore)?`<span class="subscore">${e.subscore}</span>`:"",n=T(r?.mainScore)?r.mainScore:"",i=T(r?.subscore)?`<span class="subscore">${r.subscore}</span>`:"";return`<div class="single-score-wrapper ${e?.isWinner?"winner":""}">
            <div class="side-own-single-score">
                <span class="main-score">${o}</span>
                ${t}
            </div>
            <span class="opponent-single-score">
                <span class="main-score">${n}</span>
                ${i}
            </span>
        </div>`.replace(/>\s+</g,"><")},B=(e,r,o,t)=>{if(typeof r=="function")try{const i=r(...o);if(typeof i=="string")return i;throw`options.${t} must return a string, instead returned: ${i}`}catch(i){console.warn(`Failed to get a string from ${t}.`,i)}const n=e();return typeof n=="string"?n.trim():""},Z=(e,r,o)=>{if(typeof e=="function")try{const t=e(...r);if(t instanceof Element||t===null)return t;throw`options.${o} must return an Element or null, instead returned: ${t}`}catch(t){console.warn(`Failed to get a valid return from ${o}.`,t)}},ee=e=>_(e)&&Object.keys(e).length>0,te=(e,r)=>`<div class="player-wrapper">
        <div class="nationality">${e}</div>
        <div class="player-title">${r}</div>
    </div>`,ne=(e,r,o,t)=>{const n=e.sides?.[r],i=e.sides?.[r===1?0:1];let a="",s="",l="",v="",c="",p="",b="",d="",u="hidden",h="transparent";if(ee(n)){n.isWinner===!0&&(l="winner"),typeof n.contestantId=="string"&&(v=`contestant-id="${n.contestantId}"`),typeof n.contestantId!="string"&&typeof n.title=="string"&&(p=te("",n.title)),b=B((()=>((m,f)=>{const k=_(m)&&Array.isArray(m.scores)?m.scores:[],w=_(f)&&Array.isArray(f.scores)?f.scores:[],y=Math.max(k.length,w.length);return G(y,(x=>X(k[x],w[x]))).join("")})(n,i)),t("getScoresHTML"),[L(n),L(e)],"getScoresHTML"),n.currentScore!==void 0&&(d=X({mainScore:n.currentScore},{mainScore:i?.currentScore})),n.isServing!==!0&&i?.isServing!==!0||(u=""),n.isServing===!0&&(h="");let g=o.contestants?.[n.contestantId];if(g){let m={roundIndex:e.roundIndex,matchOrder:e.order,contestantId:n.contestantId};const f=o.contestants[m.contestantId].entryStatus;c=B((()=>f),t("getEntryStatusHTML"),[f,m],"getEntryStatusHTML"),p=(g.players||[]).map(((k,w)=>((y,x,C)=>{const F=B((()=>y.nationality),C("getNationalityHTML"),[y,x],"getNationalityHTML"),z=B((()=>y.title),C("getPlayerTitleHTML"),[L(y),x],"getPlayerTitleHTML");return te(F,z)})(k,{...m,playerIndex:w},t))).join("")}}else a="empty-side";return i&&i.isWinner===!0&&(s="looser"),`
        <div class="side-wrapper ${a} ${s} ${l}"  ${v}>
            <div class="side-info-item entry-status">${c}</div>
            <div class="side-info-item players-info">${p}</div>
            <div class="side-info-item winner-mark"><svg class="default-winner-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path xmlns="http://www.w3.org/2000/svg" d="M21 6.285l-11.16 12.733-6.84-6.018 1.319-1.49 5.341 4.686 9.865-11.196 1.475 1.285z"/></svg></div>
            <div class="side-info-item side-scores">${b}</div>
            <div class="side-info-item current-score">${d}</div>
            <div class="side-info-item serving-mark ${u} ${h}"></div>
        </div>
    `},re=(e,r,o,t,n)=>{const i=Z(n("getMatchElement"),[o,t],"getMatchElement");if(i===null)return null;const a=E('<div class="match-body"></div>');if(i instanceof Element)return a.append(i),a;if(e===void 0)return null;const s=B((()=>e.isBronzeMatch===!0?'<div style="font-size: 1.6em; color: #000;">3RD PLACE</div>':""),n("getMatchTopHTML"),[e],"getMatchTopHTML");s&&(a.innerHTML+=`<span class="match-top">${s}</span>`);const l=B((()=>""),n("getMatchBottomHTML"),[e],"getMatchBottomHTML");return l&&(a.innerHTML+=`<span class="match-bottom">${l}</span>`),Array.isArray(e.sides)&&e.sides.find(ee)&&(a.innerHTML+=`
            <div class="sides">
                ${ne(e,0,r,n)}
                ${ne(e,1,r,n)}
            </div>
        `,e?.isLive===!0&&a.classList.add("live")),typeof e.matchStatus=="string"&&e.matchStatus.length&&(a.innerHTML+=`<div class="match-status">${e.matchStatus}</div>`),a},oe=(e,r,o,t)=>{const n=o.matches?.find((s=>s.roundIndex===e&&s.order===r));let i=r%2==0;n?.isBronzeMatch===!0&&(i=!1);const a=E(`
        <div
            class="match-wrapper ${i?"even":"odd"}"
            match-order="${r}"
        >
            <div class="match-lines-area">
                <div class="line-wrapper upper"></div>
                <div class="line-wrapper lower"></div>
            </div>
        </div>
    `);return a.prepend(re(n,o,e,r,t)||""),a},Se=(e,r,o)=>e.rounds.slice(0,r).map(((t,n)=>{const i=document.createElement("div");i.className="round-title";const a=Z(o("getRoundTitleElement"),[L(t),n],"getRoundTitleElement");var s,l;return a instanceof Element?i.append(a):i.innerHTML=t.name||(s=e.rounds.length,(l=n)===s-1?"Final":l===s-2?"Semifinals":l===s-3?"Quarterfinals":`1/${Math.pow(2,s-l-1)}`),i})),ae=(e,r,o)=>{r.round_titles_wrapper.innerHTML="",(i=>{if(V(i.skippedLastRoundsCount,(()=>i.rounds.push({}))),!i.matches||!i.rounds)return;const a=Math.max(...i.matches.filter((l=>l.roundIndex===0)).map((l=>l.order))),s=Math.ceil(Math.log2(2*a))-i.rounds.length;V(s,(()=>i.rounds.push({})))})(e);const t=e.rounds.length-(e.skippedLastRoundsCount||0);r.round_titles_wrapper.append(...Se(e,t,o)),r.matches_positioner.innerHTML="";const n=[];e.rounds.slice(0,t).forEach(((i,a)=>{const s=((l,v,c)=>{const p=E('<div class="round-wrapper"></div>');p.setAttribute("round-index",v);const b=l.rounds.length-1,d=Math.pow(2,b-v),u=G(d,(h=>oe(v,h,l,c)));return p.append(...u),v===b&&l.matches?.find((h=>h.isBronzeMatch===!0&&h.roundIndex===b&&h.order===1))&&p.append(oe(b,1,l,c)),p})(e,a,o);if(a===e.rounds.length-1&&e.matches?.find((l=>l.isBronzeMatch===!0&&l.roundIndex===e.rounds.length-1&&l.order===1))){const l=E(`
    <div class="bronze-round-wrapper">
        <div class="pseudo-round-wrapper">
            <div class="match-wrapper even">
                <div class="match-lines-area">
                    <div class="line-wrapper upper"></div>
                    <div class="line-wrapper lower"></div>
                </div>
            </div>
        </div>
    </div>
`);l.append(s),n.push(l)}else n.push(s)})),r.matches_positioner.append(...n)},R=(e,r,o)=>{r("showScrollbar")===!0&&(e.scrollbar.style.top=o/e.matches_positioner.clientHeight*100+"%")},Le=R,Me=(e,r,o)=>{e.scrollbar.classList.add("animated"),R(e,r,o);const t=()=>{e.scrollbar.classList.remove("animated"),e.scrollbar.removeEventListener("transitionend",t)};e.scrollbar.addEventListener("transitionend",t)},Ce=(e,r,o)=>{if(r("showScrollbar")!==!0)return;const t=e.matches_positioner.clientHeight>e.matches_scroller.clientHeight;e.scrollbar.style.visibility=t?"visible":"hidden",R(e,r,o),(n=>{n.scrollbar.style.height=n.matches_scroller.clientHeight/n.matches_positioner.clientHeight*100+"%"})(e)},ie=e=>{if(e.keyCode>=32&&e.keyCode<=40&&!e.shiftKey&&!e.altKey&&!e.ctrlKey)return O(e),!1},O=e=>{e.preventDefault()};var se=!1;try{window.addEventListener("test",null,Object.defineProperty({},"passive",{get(){se=!0}}))}catch{}var q=!!se&&{passive:!1},le="onwheel"in document.createElement("div")?"wheel":"mousewheel";const ce=(e,r)=>{e.style.margin===""?e.style.transform=`translate3d(0, -${Math.floor(r)}px, 0)`:e.style.marginTop=`-${Math.floor(r)}px`},de=(e,r)=>{const o=r.matches_positioner.clientHeight-r.matches_scroller.clientHeight,t=Math.ceil(e)>=Math.floor(o),n=r.the_root_element.querySelector(".button-down"),i=r.the_root_element.querySelector(".button-up");t?n.classList.remove("active"):n.classList.add("active"),Math.floor(e)<=0?i.classList.remove("active"):i.classList.add("active")},ue=P((e=>{e.classList.remove("is-scrolling")}),350),Te=(e,r)=>{let o=0;const{matches_scroller:t,matches_positioner:n}=e;e.the_root_element.style.setProperty("--scroll-transition-duration","0.3s");const i=()=>{n.classList.add("is-scrolling"),Le(e,r,t.scrollTop),ue(n)},a=((c,p)=>{if(p("verticalScrollMode")==="buttons")return()=>{};const b=P((u=>{u.classList.add("scroll-y-enabled")}),200),d=()=>{c.classList.contains("scroll-y-enabled")&&c.classList.remove("scroll-y-enabled"),b(c)};return window.addEventListener("scroll",d),()=>window.removeEventListener("scroll",d)})(t,r),s=c=>{n.classList.add("is-scrolling");const p=n.clientHeight-n.parentElement.clientHeight;o=j(o+c,0,p),ce(n,o),Me(e,r,o),de(o,e),ue(n)};let l=()=>{};r("verticalScrollMode")==="mixed"?l=((c,p)=>{const b=d=>{c.classList&&c.classList.contains("matches-scroller")&&!c.classList.contains("scroll-y-enabled")||(d.preventDefault(),p(d.deltaY))};return c.addEventListener("DOMMouseScroll",O,!1),c.addEventListener(le,b,q),c.addEventListener("keydown",ie,!1),()=>{c.removeEventListener("DOMMouseScroll",O,!1),c.removeEventListener(le,b,q),c.removeEventListener("touchmove",O,q),c.removeEventListener("keydown",ie,!1)}})(t,s):r("verticalScrollMode")==="native"&&(t.classList.add("scroll-y-enabled"),t.addEventListener("scroll",i));const v=((c,p,b)=>{if(p("verticalScrollMode")==="native")return()=>{};const d=u=>{const h=u.target.closest(".scroll-button");if(!h)return;const g=h.classList.contains("button-up"),m=p("buttonScrollAmount");b(g?-m:m)};return c.the_root_element.addEventListener("click",d),()=>{c.the_root_element?.removeEventListener("click",d)}})(e,r,s);return e.the_root_element.addEventListener("mouseenter",(()=>{document.querySelectorAll(".with-vertical-scroll-buttons .matches-positioner").forEach((c=>{c!==n&&(c.classList.contains("is-scrolling")||(p=>{const b=p.style.transform.match(/translate3d\(\s*[^,]+,\s*([^,]+),\s*[^)]+\)/)?.[1];p.style.marginTop=b,p.style.transform=""})(c))})),(c=>{c.style.transform=`translate3d(0, ${c.style.marginTop}, 0)`,c.style.marginTop=""})(n)})),{get_scrollY_ratio:()=>((c,p)=>{const{matches_scroller:b,matches_positioner:d}=c;return((b.scrollTop||p)+b.clientHeight/2)/d.clientHeight})(e,o),adjust_offset:c=>{const p=((b,d,u,h)=>{const{matches_scroller:g,matches_positioner:m}=d;let f;if(u("resetScrollOnNavigation")===!0)f=0;else if(u("useClassicalLayout")===!0)f=h||g.scrollTop;else{const k=m.clientHeight*b;f=j(k-g.clientHeight/2,0,m.clientHeight-g.clientHeight)}return u("verticalScrollMode")==="native"?g.scrollTop=f:(ce(m,f),m.offsetHeight),Ce(d,u,f),f})(c,e,r,o);r("verticalScrollMode")!=="native"&&(o=p),de(o,e)},uninstall:()=>{t?.removeEventListener("scroll",i),a(),v(),l()}}},$=[],pe=(e,r)=>{const{have_critical_error:o}=D((t=>{if(!_(t))return[{is_critical:!0,message:"Data must be an object, instead got: ",data:t}];if(!Array.isArray(t.rounds))return[{is_critical:!0,message:'Data must contain "rounds" property and it must be an array: ',data:t.rounds}];if(t.skippedLastRoundsCount!==void 0&&typeof t.skippedLastRoundsCount!="number")return[{is_critical:!0,message:"Data.skippedLastRoundsCount can only be a number",data:t.skippedLastRoundsCount}];if(!t.rounds.length&&!t.matches?.length)return[{is_critical:!0,message:"At least one round or one match must be provided"}];const n=[];t.rounds.forEach((a=>{_(a)||n.push({is_critical:!0,message:"data.rounds may contain only objects: ",data:a}),a.name!==void 0&&typeof a.name!="string"&&n.push({is_critical:!1,message:"round.name must be a string: ",data:a})}));const i=U(t.matches,t.contestants);return n.push(...i),t.contestants===void 0||_(t.contestants)||n.push({is_critical:!0,message:"data.contestants must be an object which maps ids to contestants, instead got: ",data:t.contestants}),_(t.contestants)&&Object.values(t.contestants).forEach((a=>{_(a)||n.push({is_critical:!0,message:"Contestant must be an object, instead got: ",data:a}),a.entryStatus!==void 0&&typeof a.entryStatus!="string"&&n.push({is_critical:!1,message:"If entryStatus is provided for a contestant, it must be a string: ",data:a}),a.players===void 0?n.push({is_critical:!1,message:"contestant.players is required: ",data:a}):Array.isArray(a.players)?a.players.length===0?n.push({is_critical:!1,message:"contestant.players must contain at least one element: ",data:a}):a.players.forEach((s=>{_(s)||n.push({is_critical:!0,message:"contestant.players array must contain only objects: ",data:s}),typeof s.title!="string"&&n.push({is_critical:!1,message:"Player must have a title, and it must be a string, instead got: ",data:s}),s.nationality!==void 0&&typeof s.nationality!="string"&&n.push({is_critical:!1,message:"If nationality is provided for a player, it must be a string: ",data:s})})):n.push({is_critical:!0,message:"contestant.players must be an array: ",data:a})})),n})(r));return!o&&(Object.keys(e).forEach((t=>delete e[t])),Object.assign(e,L(r)),!0)},Be=(e,r,o)=>{let t=!1,n=(()=>{let d={};const u=A();return{try_merge_options:h=>{h!==void 0&&(_(h)?Object.entries(h).forEach((([g,m])=>{const f=u[g];_e(g,m,f)&&(d[g]=m)})):console.warn("options must be an object, instead got",typeof h))},get_final_value:h=>J(h,d,u),get_user_options:()=>d,get_all_final_options:()=>{const h={};return Object.keys(u).forEach((g=>{h[g]=J(g,d,u)})),h}}})(),i={};const a={moveToPreviousRound:()=>{},moveToNextRound:()=>{},moveToLastRound:()=>{},setBaseRoundIndex:()=>{},getNavigationState:()=>{},applyNewOptions:()=>{},replaceData:()=>{},applyMatchesUpdates:()=>{},getAllData:()=>L(e||{}),getUserOptions:()=>L(o),highlightContestantHistory:()=>{},uninstall:()=>{},user_wrapper_el:r};if(!(r&&r instanceof Element&&r.closest("html")))return console.warn("Could not install bracket because invalid element is provided: ",r),a;$.forEach((d=>{d.user_wrapper_el===r&&d.uninstall()}));let s=(d=>{ve("root","permanent-styles",[me,ge,be].join(`
`));const u=E(`
        <div class="bracket-root">

            <div class="navigation-button left"></div>
            <div class="navigation-button right"></div>
            <div class="scroll-button button-up"></div>
            <div class="scroll-button button-down"></div>

            <div class="round-titles-grid-item">
                <div class="round-titles-wrapper equal-width-columns-grid"></div>
            </div>

            <div class="scrollbar-parent">
                <div class="scrollbar-overflow-preventer">
                    <div class="scrollbar"></div>
                </div>
            </div>
            <div class="matches-scroller scroll-y-enabled">
                <div class="matches-positioner equal-width-columns-grid"></div>
            </div>

        </div>
    `);d.append(u);const h=m=>u.querySelector(m);let g={the_root_element:u,scrollbar:h(".scrollbar"),round_titles_wrapper:h(".round-titles-wrapper"),matches_scroller:h(".matches-scroller"),matches_positioner:h(".matches-positioner")};return{...g,uninstall:()=>{Object.keys(g).forEach((m=>{g[m]instanceof Element&&g[m].remove(),delete g[m]})),g=null}}})(r);if(Y(o,n,s),!pe(i,e))return a;t=!0,ae(i,s,n.get_final_value);let l=Te(s,n.get_final_value),v=xe(s,n.get_final_value,l);const c=((d,u)=>{const h=he(u,300),g=m=>{const f=m.composedPath();f[0]&&f[0]instanceof HTMLImageElement&&f[0].closest(".bracket-root .matches-positioner")===d&&(f[0]?.style.width===""||f[0]?.style.height==="")&&h()};return document.addEventListener("load",g,!0),()=>{document.removeEventListener("load",g,!0)}})(s.matches_positioner,v.repaint);let p=((d,u,h,g)=>{const{the_root_element:m,matches_positioner:f}=h,k=w=>{if(w.button===0){if(w.target.closest(".navigation-button"))g.handle_click(w.target.closest(".navigation-button"));else if(u("onMatchClick")===null)if(u("onMatchSideClick")===null)w.target.closest(".matches-scroller")&&(u("disableHighlight")!==!0&&w.target.closest(".side-wrapper[contestant-id]")?H(f,w.target.closest(".side-wrapper").getAttribute("contestant-id")):H(f,null));else{const y=w.target.closest(".side-wrapper");if(y){const x=K(w.target,d);let C=1;y===w.target.closest(".side-wrapper:first-child")&&(C=0),u("onMatchSideClick")(x,C)}}else if(w.target.classList.contains("match-body")){const y=K(w.target,d);u("onMatchClick")(y)}}};return m.addEventListener("click",k),{uninstall:()=>{m?.removeEventListener("click",k)}}})(i,n.get_final_value,s,v),b={moveToPreviousRound:()=>t&&v.move_left(),moveToNextRound:()=>t&&v.move_right(),moveToLastRound:()=>t&&v.set_base_round_index(1/0),setBaseRoundIndex:d=>{if(S(d))return t&&v.set_base_round_index(d);console.warn("setBaseRoundIndex accepts only numbers, instead got: ",d)},getNavigationState:v.get_state,applyNewOptions:d=>{t&&(Y((u=>{const h=A(),g={};return _(u)&&Object.entries(u).forEach((([m,f])=>{h[m]?.type==="function_or_null"||m==="verticalScrollMode"?console.warn(`${m} option can't be updated via applyNewOptions`):g[m]=f})),g})(d),n,s),v.repaint())},replaceData:d=>{t&&(pe(i,d)?(ae(i,s,n.get_final_value),v.set_base_round_index(0),l.adjust_offset(0),v.repaint()):console.warn("Failed to apply new data"))},applyMatchesUpdates:d=>{t&&((u,h,g,m,f)=>{if(!Array.isArray(h.matches))return;if(!Array.isArray(u))return void console.warn("applyMatchesUpdates must be called with an array of matches, instead called with: ",u);const{have_critical_error:k}=D(U(u,h.contestants));if(k)return;const w=g.matches_positioner.querySelector(".side-wrapper.highlighted")?.getAttribute("contestant-id");u.forEach((y=>{if(!S(y.order)||!S(y.roundIndex))return;const x=h.matches.findIndex((z=>z.roundIndex===y.roundIndex&&z.order===y.order));x>-1?h.matches[x]=y:h.matches.push(y);const C=g.the_root_element.querySelector(`.round-wrapper[round-index="${y.roundIndex}"]`)?.querySelector(`.match-wrapper[match-order="${y.order}"]`);if(!C)return;C.querySelector(".match-body")?.remove();const F=re(y,h,y.roundIndex,y.order,m);C.prepend(F||"")})),f(),typeof w=="string"&&w.length&&H(g.matches_positioner,w)})(d,i,s,n.get_final_value,v.repaint)},getAllData:()=>L(i||{}),getUserOptions:()=>L(n?.get_user_options()||{}),highlightContestantHistory:d=>{t&&H(s.matches_positioner,d)},uninstall:()=>t&&(()=>{if(!t)return;c(),p.uninstall(),l.uninstall(),v.uninstall(),s.uninstall(),s=null,n=null,i=null,e=null,p=null,l=null,v=null;const d=$.indexOf(b);d>-1&&$.splice(d,1),b=null,t=!1})(),user_wrapper_el:r};return $.push(b),b};export{Be as createBracket};
//# sourceMappingURL=/sm/f01b5fbb8f29764bd852c60a1d24ce6dae77ed1cd350b080fdf0ac43bd004e77.map