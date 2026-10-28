# Changelog

Versions are assigned to grouped milestones; small fixes and follow-up tweaks are included with the related entry. Entries are ordered newest first.

- **v0.12** · **2026-10-28** — The sticky lesson header now shows the lesson's tracked study duration and a timer since the most recent answer reveal; closing answers does not reset the reveal timer, and it starts fresh after a page reload.
- **v0.11** · **2026-10-27** — Switching lessons blurs the word list and collapses settings; creating a lesson opens settings with the list unblurred. Changing the random-order setting and restarting with it enabled smoothly reshuffles groups and the words within each group, keeping groups intact. The floating reveal button continues after the last word it opened, wraps around to skipped words, and scrolls to off-screen words before revealing them. Lesson pages include vertically stacked previous/next lesson cards with dashboard details. Study recency now shows minutes or hours after a session reaches 10 seconds of tracked time. Answers support `<br>`-separated, sequentially revealed lines; clicking a later hidden line reveals its predecessors. The floating reveal button advances one answer line at a time, scrolls to the target line, and word-level progress completes only when all lines are open.
- **v0.10** · **2026-10-24** — Improved lesson statistics, added sorting for complex words, and introduced a compact home-screen changelog. Random order is preserved when difficulty changes and stored per lesson; lesson copying is off by default and retains the user's choice.
- **v0.8** · **2026-10-23** — Added lesson creation dates to the activity chart.
- **v0.7** · **2026-10-22** — Added a lesson dashboard with activity charts, lesson statistics, and browser navigation. Added a virtual lesson for difficult words.
- **v0.6** · **2026-10-20** — Added visual separators for word groups and reorganized settings. Progress and key controls now stay visible while scrolling.
- **v0.5** · **2026-10-19** — Added a floating, draggable control for revealing words one at a time, with automatic scrolling and restart controls. Added keyboard controls for revealing the next row.
- **v0.4** · **2026-10-18** — Added lesson management, import and export, difficulty ratings, and study-time tracking with lesson activity details. Completed the English interface and replaced the personal sample list with a travel-themed demo. Improved answer revealing and scrolling.
- **v0.3** · **2026-10-15** — Fixed an issue that could leave the word list empty after reloading with random order enabled.
- **v0.2** · **2026-05-31** — Added Russian and English localization, responsive desktop width controls, and automated deployment.
- **v0.1** · **2026-05-30** — Built the core vocabulary-learning experience: word lists, progress tracking, random order, difficulty filtering, and lesson management. Added visual themes and browser-language-based localization.
