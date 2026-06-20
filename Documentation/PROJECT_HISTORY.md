## Background

During the inception of this extension in April 2026, Chrome's (`v147`) built-in bookmarks manager and Brave's (`v1.89.143`) new bookmarks manager felt insufficient and difficult to use compared with Firefox.

### How this extension grew
Initially the aim was to ask a custom `ChatGPT 5.4` (web) to see if it could reproduce the Firefox bookmarks manager using `Firefox 140.10 ESR`'s codebase, converted/rewritten for Chromium browsers.

Instead of just making a modified copy, **ChatGPT decided to write the whole thing from scratch without using anything from Firefox's source code**.

The `v0.1.0` result surprisingly worked without errors, but was completely rudimentary and missing most features expected of a bookmarks manager. It "worked", but left a lot to be desired.

At this point the plan changed to seeing if it was possible to vibe code an almost feature-parity bookmarks manager for Chromium, then release it for free for anyone to use. It was also at this point around v0.1.0 that the decision was made to make this a privacy-first bookmarks manager.

**No network connections were allowed, and no permissions were requested beyond those absolutely necessary for a basic bookmarks manager.**

In short: **NO Telemetry**, **NO Ads**, **NO Subscriptions**, **NO Web ANYTHING**.

What started as a simple experiment grew into a much larger implementation effort. Simple features we take for granted were missing and required creating from scratch and instead of using pre-made packages; everything was written from scratch.

As a nod to Firefox's influence on the project, the extension is released under the Mozilla Public License 2.0 (`MPL-2.0`).

The source code has be published to [GitHub](https://github.com/SoraKagami/Simple_Bookmarks_Manager/tree/master).

### The original aims became:
1. Attempt to recreate something similar in experience and usability to Firefox's bookmarks manager as a Chromium extension
2. Use this as a chance to practice vibe coding
3. See how far vibe coding can go before requiring manual code changes
4. Learn to work around the "current" limitations of GenAI, specifically ChatGPT 5.4, then ChatGPT 5.5 (2026 May/June)
5. PRIVACY-FIRST. Absolutely NO network access required for the bookmarks manager.

### Then things grew. It was no longer simple.
As development continued and the extension was "dogfood(ed)" (daily driven by the dev). Anything that did not work, any feature that was missing became a recurring issue that required documenting and/or addressing. ASAP. This resulted in features growing beyond what Firefox's bookmarks manager had. Usability? This became a first and foremost pressing issue instead of just a "nice to have". If it was hard to use, it was intolerable.

It ended up taking over 110 commits to get the extension to a state that was deemed good enough for publishing this extension to the Chromium Web Store. More hours than the author would like to admit and endless frustrations when ChatGPT got the context wrong. Sometimes the author did not explain things right or well enough to ChatGPT too. Just the conversation logs with ChatGPT took around half the size of a PhD thesis.

### Vibe coding approach
Everyone codes things differently, so this method may not be applicable to others.
Ideas were conceptualised then converted to human-readable sentences with a focus on being explicit about designs, sometimes as pseudo-code, then fed to ChatGPT. On occasion where it seemed interesting to do so, more leeway was given or in some cases, decisions left completely to ChatGPT. Most of the time the author had full directional control.

Once a build was returned, all code changes were manually vetted. Logic checked, functions checked. Things HAD to make sense to be accepted, as GenAI, at least as of 2026, still hallucinates too often to be relied upon.

Upon passing the check the code was committed to a git repo, then tested in a Brave browser. All features were thoroughly tested. Since all changes were read, it was easy to identify which aspects to focus the testing on instead of repeating all test steps every single update.
Any issues were then identified & passed back to ChatGPT to fix and address. New features & changes were also added as things progressed.
This whole process looped until everything was done.

Where appropriate updates were sometimes broken up into smaller chunks to address, as there was always the worry that ChatGPT may hallucinate and mess everything up. Surprisingly this didn't really happen, or at least didn't make it into the returned code. It did on occasion hallucinate during the thinking phase, but somehow manages to fix itself at the end. There were a couple of instances where ChatGPT hallucinated that it finished and returned nothing but an empty null link. When it does this, it ended up being quite easy to spot: it would think and reply in around under 15 seconds. Normally it would take minutes. The worst was near the end where during one conversation, the solution ChatGPT came up with was really bad and the author had to keep asking it to not use that approach, but then was ignored. Other than that, this whole process ended up going well past the allowed maximum conversation length, and probably half way through a second to get to the initial release version.

The making of this extension served as a really good learning experience for both how to make a decent Chromium extension, as well as vibe coding, vibe debugging, and addressing the limitations of working with the current ChatGPT 5.4/5.5 (Thinking).

For anyone interested, the ChatGPT prompts and chat logs were manually saved and are available in this extension's source repository over at:
https://github.com/SoraKagami/Simple_Bookmarks_Manager/tree/master/GenAI_Prompt_Logs