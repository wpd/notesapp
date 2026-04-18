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