# 04/14/26
## Background
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

## My first attempt with the new development strategy
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

## Success, of a sort

Eventually, Claude Code reported a partial success.  It was able to run the unit tests, but neglected to include a tool dependency for the E2E tests.  I installed that tool and prompted Claude Code to continue to develop, debug, and iterate on Phase 1 until the E2E tests passed.  Which it did while I went to work.  Maybe it prompted me about executing some more commands as it got started, maybe it didn't.  I don't recall.

## Now what?
While I was at work, I interacted with Claude on my iPhone to ask about deploying and testing the application on my MacBook.  It gave me some advice and cautions about starting that process sooner in the development than later, which is where I will go next.  But I wanted to get this much written down for now.

## Next steps
1. Roll out the new `.claude/settings.json` file.
2. Follow Claude's recommendations for testing this code on my MacBook.
3. Run the tests and application (at least) once on my Linux VM.