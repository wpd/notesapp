# Diary of thoughts and notes to myself about this project
## 04/14/26
### Background
Maybe I will backfill this someday.  (Maybe I'm doing that now.) For now...

I had Claude interview me for this project and ultimately produced a SPEC.md with 10 development phases.  I fed it into Claude code, asked it to implement phase 1, and went to work.  When I got home, it was stuck at a prompt asking me if it was okay if it ran some innocuous looking command.  I have no idea how much of the day it was stuck at that prompt.  I clicked on (one of the) "Yes" button(s)... only to have it prompt me again for another command, and then again for another command, ad nauseam.

Eventually it stopped asking me about executing commands and produced an executable, and instructions for running the code in debug/development mode.  I did so, and found something that wasn't working.  I told Claude Code that and it changed the code.  Then I ran the code again and found that something (else/still) wasn't working.  I told Claude Code that, it change the code, and I ran it again, and again, and again, ad nauseam.

Eventually I finished Phase 1, and moved onto phase 2, where, once again, Claude Code prompted me regarding the execution of a command, and once again, the code that was eventually produced didn't work, and once again I played debug monkey for Claude Code.

I got tired of playing this game and decided to start over.  But first I spent a couple of days working with Claude to craft the perfect script to create the perfect Linux VM in which I could turn Claude Code lose and tell it not to ask me any questions.  I set up the VM with Chrome and the Claude Code for Chrome extension so that Claude Code could develop and run unit and integration tests without my involvement.

Then I worked with Claude on SPEC.md again.  I polished it and focused Claude on a Linux VM based development approach that would enable Claude Code to iterate until the code functioned according to the specification without my involvement.  I even asked Claude about enabling the agent to run without asking me any of those annoying questions.  It told me I should put the following in my `.claude.md` file and that I should invoke Claude code with the `--dangerously-skip-permissions` option:

>
```
{
  "permissions": {
    "allow": [
      "Bash(cargo:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(xvfb-run:*)",
      "Bash(git:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(rm:*)",
      "Bash(touch:*)",
      "Bash(echo:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
      "Bash(rustc:*)",
      "Bash(rustfmt:*)",
      "Bash(clippy-driver:*)",
      "Bash(wdio:*)",
      "Bash(vitest:*)",
      "Bash(tsc:*)",
      "Bash(python3:*)",
      "Bash(fc-cache:*)",
      "Bash(unzip:*)",
      "Bash(pkill:*)",
      "Bash(kill:*)",
      "Bash(ps:*)",
      "Bash(env:*)",
      "Bash(which:*)",
      "Bash(chmod:*)"
    ],
    "deny": [
      "Bash(sudo:*)"
    ]
  }
}
```

### My first attempt with the new development strategy
I asked Claude to prepare a `DEV_ENVIRONMENT.md` file with instructions for installing of the development dependencies for the project, which it did.

Claude even gave me the prompt I should use to implement Phase 1 of the project:

> "Read CLAUDE.md and ROADMAP.md. Begin Phase 1. Start with the infrastructure checklist — scaffold the Tauri project, configure the test runners, and get npm run test to a passing baseline before touching any UI."

I created the `.claude/settings.json` file, installed all of the dependencies and thought I was ready to go.  I fired up Claude Code in a `screen` window on the VM with the `--dangerously-skip-permissions` option and went to bed.  When I woke up the next morning, I found the following in the `screen` window:

>
```
 Bash command

   mkdir -p /home/wpd/src/notesapp/.claude && ls /home/wpd/src/notesapp/.claude/ 2>/dev/null || echo "empty"
   Run shell command

 Claude requested permissions to edit /home/wpd/src/notesapp/.claude which is a sensitive file.

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to .claude/ from this project
   3. No
```

I was livid.  I opened up a Chat window with Claude and expressed my frustration.  It suggested that I browse to https://www.anthropic.com/contact and provide product feedback (which would have been much like the diatribe written above).  I clicked the link and got a "page not found" (404) error.

Once again, I was livid, perhaps even more so than before.  I eventually hit the Thumbs Down button in that Chat and told Claude Code to proceed, which it did until it hit another command for which it wanted my permission to execute.  I said "Yes", and it proceeded until it hit yet another command, ad nauseam.  Keep in mind that Claude Code was running with the `--dangerously-skip-permissions` command line option.

Eventually, Claude Code suggested that I put the following in my `.claude/settings.json` file (and continue to run with `--dangerously-skip-permissions`).  I will do that shortly, but I have no expectation whatsoever that it will help.

>
```
{
  "defaultMode": "bypassPermissions",
  "permissions": {
    "allow": [
      "Bash(cargo:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(xvfb-run:*)",
      "Bash(git:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(rm:*)",
      "Bash(touch:*)",
      "Bash(echo:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
      "Bash(rustc:*)",
      "Bash(rustfmt:*)",
      "Bash(clippy-driver:*)",
      "Bash(wdio:*)",
      "Bash(vitest:*)",
      "Bash(tsc:*)",
      "Bash(python3:*)",
      "Bash(fc-cache:*)",
      "Bash(unzip:*)",
      "Bash(pkill:*)",
      "Bash(kill:*)",
      "Bash(ps:*)",
      "Bash(env:*)",
      "Bash(which:*)",
      "Bash(chmod:*)"
    ],
    "deny": [
      "Bash(sudo:*)"
    ]
  }
}
```

### Success, of a sort

Eventually, Claude Code reported a partial success.  It was able to run the unit tests, but neglected to include a tool dependency for the E2E tests.  I installed that tool and prompted Claude Code to continue to develop, debug, and iterate on Phase 1 until the E2E tests passed.  Which it did while I went to work.  Maybe it prompted me about executing some more commands as it got started, maybe it didn't.  I don't recall.

### Now what?
While I was at work, I interacted with Claude on my iPhone to ask about deploying and testing the application on my MacBook.  It gave me some advice and cautions about starting that process sooner in the development than later, which is where I will go next.  But I wanted to get this much written down for now.

### Next steps
1. Roll out the new `.claude/settings.json` file. (done)
2. Follow Claude's recommendations for testing this code on my MacBook.
3. Run the tests and application (at least) once on my Linux VM.

### Actual next step
I notice that Phase 1 is not actually complete (because the prompt I gave Claude code was to "Begin Phase 1").  Claude.ai recommends that I wait until Phase 1 is complete before rolling out the test framework on my MacBook, and Claude Code recommends that I submit the following prompt to a new instance (uncluttered by all of the debugging detritus) 

> Read CLAUDE.md and ROADMAP.md in full. The Phase 1 infrastructure baseline is complete — all three test layers pass (npm run test exits 0). Now implement the Phase 1 UI: the tiling layout shell, activity sidebar, tile title bar, project directory setup, and keyboard shortcuts, exactly as specified. Write tests alongside the implementation. Do not consider Phase 1 complete until npm run test passes with E2E tests covering the Phase 1 behaviors.

to which I will add (as advised by a previous conversation I had with Claude.ai after I got tired of my credits running out before my 5 hour limit):

> If you stop for any reason, leave a PROGRESS.md file summarizing exactly what you completed, what's in progress, and what remains. Write it so a fresh Claude session can pick up from it.

At Claude Code's recommendation (because I have changed `.claude/settings.json`) I have exited my current session (using `quit`) and am restarting, confirming that I started it with:

```bash
claude --dangerously-skip-permissions    
```

I will now prompt it with:

> Read CLAUDE.md and ROADMAP.md in full. The Phase 1 infrastructure baseline is complete — all three test layers pass (npm run test exits 0). Now implement the Phase 1 UI: the tiling layout shell, activity sidebar, tile title bar, project directory setup, and keyboard shortcuts, exactly as specified. Write tests alongside the implementation. Do not consider Phase 1 complete until npm run test passes with E2E tests covering the Phase 1 behaviors. If you stop for any reason, leave a PROGRESS.md file summarizing exactly what you completed, what's in progress, and what remains. Write it so a fresh Claude session can pick up from it.

## 04/15/26
### Morning Results
I woke up the next morning to find (unsurprisingly) that Claude had hit its resource limit.  I was disappointed not to see a `PROGRESS.md` file.  So I asked Claude about it:

> \> I see that you did not follow my instructions and create a `PROGRESS.md` file when the rate limit was hit. Do you have enough information to continue working from where you left off or do you need further clarifications.

...to which Claude Code responded by continuing its task.

okay... I guess.

### Evening Results
I returned home from work this evening and opened up my Claude Code window at 7pm to see that, once again, (and just as unsurprising) it had hit its rate limit.  This time, I prompted it with:

> \> continue

and it continued, until it hit its rate limit at 8pm, telling me it was locked out until 11pm.  I thought the time window was 5 hours, but it now seems to be 4 hours.  I'm not going to argue.

I found this [blog post](https://www.nathanonn.com/how-to-double-your-claude-code-usage-limits-without-upgrading-to-max/) which offered the handy tip that the time limit window (whether it is 4 hours or 5 hours) is a rolling window, that starts with the first Claude interaction... so, if I knew I was going to sit down with Claude at 7, and I knew I was going to chew through my allotment in just 1 hour, (and I knew that the rolling windows was 4 hours), I could have asked Claude a question at 4pm, restarted the Claude Code session at 7pm, hit my limit at 8pm, just as the limit reset.

I might try to try that tomorrow.  For now, I think I'm going to be up until 11 so I can ask Claude Code to continue again.  (Which I did.)

## 04/16/26
### Continuing on
I told Claude to continue again first thing in the morning (around 7am), ran out of tokens again, and checked in with Claude (via an ssh session to my `screen` window in which Claude Code was running) around 11:30.

I asked Claude (via my phone) about switching to Opus and was told:

```
/model opus
```

I mentioned the fact that Claude Code has not generated a `PROGRESS.md` file for me during each of timed out sessions.  I also (perhaps at Claude's prompt) expressed concern about whether I should start a new session for the Opus session or change the current session, and the cost of reading/parsing/dealing with the entire conversation history in my current Sonnet session.  I am still not sure I completely understand all of this, but it seems like I would have to pay the price of parsing the history in either case (creating the `PROGRESS.md` file or just switching the model) and Claude recommended that I use the following as prompt:

> Before we continue: create PROGRESS.md right now in the project root. Include: current objective, every completed step with outcome, the exact next step, and any open questions or blockers. Be specific — this file is your only memory across rate-limit resets. After creating it, confirm what's in it, then continue with the next task.

I tried pasting that in at the prompt and Claude Code appeared to go back to working on my project.  When I checked in later, I did not see a `PROGRESS.md` file (although I do now, sometime after 8pm).  Sometime around 4, when my timeout had expired, Claude was no longer working.  I checked in on it with:

> Does this implementation meet all of the requirements laid out for phase 1?

I have lost the response it gave me, but I recall it mentioning several things that still needed work and asked me what it should do, one option being "work through in order", which is what I requested.

### What's happening at 8pm?
I connected back, told Claude to `continue` and a few minutes later, it presented me with:

```
All 7 Phase 1 gap-closing tasks are complete. Here's the summary:

  Test results — all green across three layers:
  - Rust: 15 pass
  - Vitest: 9 files / 84 tests pass (was 59)
  - E2E: 26 pass (was 23)

  What was implemented this session:

  ┌────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
  │        Task        │                                        Change                                         │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
  │                    │ schedulePersist() (250ms debounce) fires after splitTile, closeTile, toggleMaximize,  │
  │ 4. Auto-persist    │ setMosaicTree, setTileFile. Pin intentionally excluded (transient per spec). 8 new    │
  │                    │ unit tests.                                                                           │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
  │ 5. Crash-recovery  │ RecoveryDialog.tsx — lists .tmp autosave files on project open, offers Recover All /  │
  │ dialog             │ Discard All. Wired into AppShell via find_recovery_files IPC. 6 new unit tests.       │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
  │ 7. Layout          │ Reads .notesapp/layout.json from the host filesystem after a structural change.       │
  │ persistence E2E    │ Validates leaf/tile shape invariants that loadLayout depends on. 2 new E2E tests.     │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤
  │                    │ ⚠ File not found card in EditorPane (3 tests). Native spellcheck on CodeMirror.       │
  │ 6. Nit-fixes       │ Distinct C-x C-f find-file picker with "Create new note" row (3 tests). LaTeX         │
  │                    │ highlighting confirmed working.                                                       │
  └────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘

  One item deferred: Moving the word-wrap toggle from the editor status bar to TileBar (requires lifting local
  state to store or ref — low risk, pure UX polish).

  New files created:
  - src/components/RecoveryDialog.tsx
  - tests/unit/RecoveryDialog.test.tsx
  - tests/unit/EditorPane.test.tsx
```
### Where now?
Asking Claude in /plan mode:

> ❯ Where do we stand now?  Do you believe that phase 1 is complete?  Is @PROGRESS.md up to date with respect to where things stand now?  Should you check off the completed boxes in @ROADMAP.md or should I?  Why haven't you committed any of your work to the git repo like you did earlier in this process? 

### Let's set up README.md and GitHub CI/CD
Actually, let's have Claude do that for me

> \> I am planning on pushing to GitHub at a cadence that would be similar to making pull requests onto main.  So I think I am okay with running the full suite of tests... Does GitHub impose restrictions on the complexity, compute, disk, memory, or networking usage of the CI/CD pipeline?

## 04/17/26
### Build and run on my MacBook
Prerequisites:

```bash
# Install Xcode Command Line Tools. (Already done)
xcode-select --install

# Install Homebrew (I don't think I should need this, but I'll do it anyway)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Rust and tauri-cli (I had already installed Rust, tauri-cli was new)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
cargo install tauri-cli --version "^2.0"
cargo install tauri-driver

# Install npm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20

# Install Python 3.10+
# I downloaded and installed Python 3.13.13 from https://www.python.org/downloads/macos/
# Then I updated the PATH in my terminal to find it before the 3.9 Python that
# was already installed.
```

Clone, build, and run

```bash
git pull
npm install
npm run tauri:dev
```
### Found a bug, asked Claude to write a test for it
I tried splitting a pane horizontally and then vertically (or perhaps the other way around,
I don't recall).  The first time I tried that, the application screen showed blank white
all over.  The second time, it appeared to crash.  So I gave Claude Code the following
vague prompt.

> Please construct a test where you open a blank project, split the pane on the left horizontally, and then spilt the bottom left pane vertically.  When I try that, the application does not appear to behave properly.      

I was quite surprised to watch Claude Code dig into the source tree analyzing the split
logic.  It ultimately came up with some new tests and some recommended changes, which
I accepted.  I also updated SPEC.md (and had Claude Code create tests to verify) that
panes can be split arbitrarily, up to constraints imposed by the canvas size.

### Hmmm... I think I found an inconsistency in the spec
I just prompted Claude with:

> Is SPEC.md  missing requirements for specifying the mode (Editor, Preview, Reference, or AI Chat) of the different panes?  Is it missing requirements for associating a Preview pane with a specific notes file?  If so, what prompt should I give to Claude Code to add those requirements, and in which phase should they be implemented?

and we discussed various changes to the spec to address this.  The end result is likely
to be new versions of SPEC.md and ROADMAP.md and a prompt to Claude Code to revisit its
phase 1 work.  Stay tuned.

# 04/17/26
## Started building the code...
Chatted with Claude this morning about tweaking the spec.  Tweaked.  Created a PROMPT.md,
told Claude to read that, then ... got rate limited again.

## NOTES TO SELF
Or, perhaps **Notes to Self and Claude, once the current rate limit timer expires**

```
/btw What is the recommended approach to telling `claude` to continue the work it was doing when it hit the rate limit.  Is typing `continue` sufficient?  Or is there something else I should do?
```
Claude said that `continue` is sufficient, but my use of `PROGRESS.md` also helps (although
as you'll see below, I have my doubts.))

```
/btw Is it possible for you to save state in such a manner as to allow me to shut down this `claude` session, reboot the computer, and then restart `claude` picking up with its state exactly where we are right now?
```

Claude responded:
>     Not exactly as-is, but close. Here's the situation:
>
>    What's preserved automatically:
>    - Your conversation history is saved by Claude Code and will be available when you restart.
>    You can resume a previous conversation with claude --continue (most recent) or claude --resume
>     (pick from a list).
>
>    What's NOT preserved:
>    - The exact internal context window state. When you restart, the conversation may be loaded
>    from a compressed/summarized form, so some nuance can be lost.
>    - Any background tasks or running processes obviously stop.
>
>   Best practice for a clean shutdown/resume:

>    1. Ask me to update PROGRESS.md with the current exact state before shutting down — what's
>    done, what's in progress, what's next, any known failing tests, etc.
>    2. Reboot.
>    3. Start claude --continue or claude --resume to pick up the conversation.
>    4. Say "read PROGRESS.md and continue from where we left off" if the context seems degraded.
>
>    The PROGRESS.md approach you're already using is essentially the best manual state-saving
>    mechanism available. It's more reliable than conversation history alone because it's explicit,
>     structured, and doesn't degrade with context compaction.
>
>    So: claude --continue + PROGRESS.md is the most robust resume strategy.

If it is possible to do that, then I think I want to shut down and increase the number of cores to 8.

I was going to ask the following, but I think it has been overcome by the previous answer.

```
/btw How can I modify the current prompt to require that `claude` update and commit the PROGRESS.md file as it starts, stops, and, if necessary, revisits each work package?  The prompt I gave Claude when I told it to proceed with the work on which we had agreed included "Please update/rewrite PROGRESS.md as you complete each body of work so that, if you are interrupted, a new Claude Code CLI session can pick up where you left off."  I see that PROGRESS.md has been updated.  I see that it has 15 work packages listed.  I see that the status for each work package is listed as "not started".  Yet, I note that work package 2 said to create `src-tauri/src/watcher.rs` and I see that that file has been created.  That implies to me that `claude` must have completed work package 1.  It would be especially interesting to me to see the date & time at which each work package was started (with PROGRESS.md committed with that update) and the date and time at which each work package was completed.  This current session is operating of a PROMPT.md file.  Should I update PROMPT.md with those instructions (and possibly update the table in PROGRESS.md to include the "Started at" and "Completed at" fields in addition to the "Status field)?  What is the recommended best practice for this level of tracking?  (Please keep in mind I am open to being told that the recommended best practice is that this is not considered to be a good practice at all and I should just let it go.)
```

In the mean time, I'm going to ask Claude to write PROGRESS.md, shut down this vm and tell it to use more of the 24 cores I have on my server.

> >  Update PROGRESS.md with the current exact state of your work so that I can reboot this machine and restart this session.   

I rebooted and restarted.  Unfortunately, that has not gone well.
## Claude Code 4/19/26 style
Well, first of all, neither:

```bash
claude --continue
```

nor

```bash
claude --resume
```

Resumed the session I had before.  Both reported messages about "no conversation to resume".  So I just tried starting `claude`, forgetting the `--dangerously-skip-permissions` option.  So I exited and restarted with that option.

In all cases, the color scheme was unreadably (for me) off.  I asked Claude (app) about this (pasting a screenshot of what I saw) and the possibility of rolling back to the version of Claude Code I was using before.  I was told:

> Given your screenshot, this really does look like a theme rendering bug rather than a "the new version is broken" bug. Two quick things worth trying in the 30 seconds before you commit to a downgrade:
>
> 1. **Switch to the ANSI-only dark theme:** `/theme` → "Dark mode (ANSI colors only)". The red backgrounds you're seeing are true-color RGB escapes; the ANSI theme uses only your terminal's 16-color palette, which should respect your VS Code terminal's black background properly.
>
> 2. **Set truecolor on the remote:** before launching Claude, `export COLORTERM=truecolor` (and add it to your `~/.bashrc` or `~/.zshrc` on `ccg1`). The washed-out/garish backgrounds over SSH are a known issue when Claude falls back to a degraded palette.

## Continuing on
So, I ultimately told Claude Code:

> `> read PROGRESS.md and continue from where we left off`

and ran until I hit the rate limit again.  More to come tomorrow.  I think I'll start by telling Claude to save PROGRESS.md again, exit out, set `COLORTERM`, perhaps remember to launch `claude` with `--dangerously-skip-permissions` and maybe keep going again.

## Continuing continuing on
Claude Code finishing munging.  I asked it if it thought it was done with Phase 1 and it stated that there was still an implementation gap as well as some E2E testing gaps.  I asked it to elaborate on the E2E testing gaps, and then crafted the following prompt where I hope I am telling it to tackle the implementation gap first and then set things up so that I can exit and restart Claude Code with a usable color scheme.

> `> Please write the E2E testing gaps and your recommended approaches to addressing them to a file (E2E_GAPS.md, perhaps?) in such a format that I could start a fresh claude code session with a prompt similar to "Read E2E_GAPS.md and then discuss with me the recommended options for addressing them."  Then please address the installation gaps.  Then remind me of the E2E gaps file and a suitable prompt for starting a fresh Claude Code session to address them.`

It crunched away and eventually presented me with:

```
● All implementation gaps closed. Final test status:

  - Rust: 34 passed
  - Vitest: 130 passed (+17 new)
  - E2E: 43 passed
  - npm run test: EXIT=0
  - typecheck + clippy: clean

  Implementation gaps addressed:
  1. Missing-recovery dialog wired in App.tsx:handleCloseTile/handleOpenDifferent → MissingRecoveryDialog
  2. + New note extension validation test coverage (already implemented)
  3. LaTeX/Mermaid distinct editor tokens — new mathMermaidHighlight ViewPlugin + theme classes .cm-math-inline,
  .cm-math-display, .cm-mermaid-block
  4. Chooser-result reprocessed — setProjectDir now returns boolean; ProjectLoader loops the chooser on a failed
  §6.1.1 resolution and surfaces the reason

  E2E gaps reminder: /home/wpd/src/notesapp/E2E_GAPS.md documents the five deferred E2E coverage items with
  recommended approaches (env-resolution per-launch fixtures, restart-with-deleted-file, drag-drop, native chooser
  mocking, consolidated quit dialog). Suggested fresh-session prompt:

  ▎ Read /home/wpd/src/notesapp/E2E_GAPS.md end to end, then discuss with me the recommended options for addressing
  ▎ each gap. Once we agree on an approach per gap, implement them in the order recommended in that file. Run npm
  ▎ run test after each gap is addressed and before declaring it done.
  ```

  So now, I think I am going to work with Claude.ai to address the UI issues.

## Let's Roll Claude Code back to the version I liked better
  Hmpf... I notice that when I quit this session it showed:
  ```
  ❯ quit 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle)
  
Resume this session with:
claude --resume b47f1a00-58a8-4e34-a60c-b5f01f4c9d5c
```

I wonder if it did that last time.  Anyway, I'm writing this down now and am hopeful that I can resume this session with the rolled back version.

I tried launching Claude Code with:
```bash
COLORTERM=truecolor claude --dangerously-skip-permissions
```
and still got the weird black background with characters written as black strokes in a white character block.  I don't like this.  Claude.ai is going to help me roll back to something I liked better... I hope...

```bash
$ claude doctor

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Diagnostics                  
  ├ Currently running: native (2.1.114)
  ├ Path: /home/wpd/.local/share/claude/versions/2.1.114
  ├ Config install method: native
  └ Search: OK (bundled)

  Updates
  ├ Auto-updates: enabled
  ├ Auto-update channel: latest
  ├ Stable version: 2.1.98
  └ Latest version: 2.1.114
                                                       
  Still having issues? Run /feedback to report details.
                         
  Press Enter to continue

$ which claude
/home/wpd/.local/bin/claude
```

Claude.ai says I should:

> Inside Claude Code, run:
> `/config`
> Change autoUpdatesChannel from latest to stable. It will prompt you — choose to allow the downgrade to 2.1.98. From then on you'll only get stable releases, which skip builds with major regressions and lag "latest" by about a week.

So I'm gonna try that...

Restarted, and now I see that it reports "Claude Code v2.1.98".

Let's try:
```bash
claude --resume b47f1a00-58a8-4e34-a60c-b5f01f4c9d5c --dangerously-skip-permissions
```
and this prompt:
```
> Read E2E_GAPS.md end to end, then discuss with me the recommended options for addressing each gap. Once we agree on an approach per gap, implement them in the order recommended in that file. Run npm run test after each gap is addressed and before declaring it done.

Well... resuming that session resumed the weird colors.  Let's try a fresh session...

That still showed the weird colors.  I am going to try Claude Code's other recommendation, which was to use `/theme` and chose the "Dark mode (ANSI colors only)" option.  So far, that is looking better.  So I'm gonna resume that other session and keep going

... only to hit my rate limit (and, it would seem, I might be getting close to my weekly rate limit).

I'll pick this up again in a couple of hours.

# 04/25/26
## Shot myself in the foot a couple of times, maybe
I asked Claude Web to prepare an update to SPEC.md and ROADMAP.md.

That was a frustrating exercise in and of itself, because Claude Web could not read ROADMAP.md, despite the fact that I have the GitHub connector as part of the project and list ROADMAP.md as one of the files.  Apparently, I am supposed to click on the sync button, which I tried, but Claude Web could still not find ROADMAP.  So I manually uploaded it (all of the .md files, actually).  I didn't see it in the list, so I added it again.  Then I saw that I had 2 copies in the list of uploaded files, so I deleted the second one.  Then I told Claude to read ROADMAP.md, and it still couldn't find it.  Then I uploaded it manually again and it was finally able to find it and produce new versions o SPEC.md and ROADMAP.mp, which I downloaded and reviewed in my Mac.

Then I committed and pushed them (well, almost) and told Claude Code CLI to implement the changes.  It is working on them now.

Here is my second application of my footgun... I noticed that I actually only committed and pushed the new version of ROADMAP.md, not SPEC.md.  So, Claude Code CLI is busy operating on a change to ROADMAP.md only.  We'll see how well that goes.

## I wonder if I can make Claude Code CLI smarter about how it does its work
I noticed this message scroll by as Claude Code was working on my latest change:

> The E2E test fails because it's running against a pre-built binary that doesn't include our fix.

I am noting that here so that (perhaps) I may remember to tell Claude Code CLI to do some magic to ensure that it doesn't waste time running against a pre-built binary that doesn't include its changes.

## More wasted tokens
> gh is not available. Trying WebFetch to read the CI failure log.
Ran out of tokens while addressing.  I think I need to

```bash
sudo apt install -y gh
```

But, Claude Code CLI says I also need to

```bash
gh auth login
```
which I don't want to do on my VM.  I asked Claude Code about that and ran out of tokens for the night.

Claude told me I didn't have a choice.  So I asked Claude if there was a machine specific file I could create that said "Use WebFetch instead of gh".  It told me to put the following in `~/.claude/CLAUDE.md`, so I did:

```bash
cat > ~/.claude/CLAUDE.md
- Do not use `gh` CLI for any purpose. Use `WebFetch` to access GitHub URLs instead.            
    `gh auth login` has not been run on this machine and the CLI is unauthenticated. 
```


## Another UI feature I don't care for
Apparently, pressing `-` multiple times followed by a space collapses the
multiple hyphen characters (I tried with 5) into a single not-hyphen character,
which makes constructing tables difficult.

| Heading 1 | Heading 2 |
| --------- | --------- |
| Item 1    | Item 2    |
| Item 3.   | Item 4.   |

doesn't work.  Claude claims that is MacOS specific behavior and is fixing it now.

## Should mermaid diagrams work?  I think they should
Check with Claude tomorrow.