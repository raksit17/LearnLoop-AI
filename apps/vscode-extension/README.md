# LearnLoop CodeLab — VS Code Extension

Open JavaScript exercises directly from LearnLoop AI without downloading individual .mjs files.
The extension opens an **untitled** document, runs local tests only when requested, and sends individual case results back to LearnLoop.

## Install (once)
1. Install Node.js 22 and VS Code 1.95+.
2. In `apps/vscode-extension`, run `npm run package` (requires internet access for vsce the first time).
3. In VS Code, run **Extensions: Install from VSIX...** and select the packaged VSIX.
4. Start LearnLoop locally at `http://localhost:4318`, open **ฝึกเขียนโค้ด** and choose **เชื่อม VS Code**.
5. Use the provided VS Code link to pair. Alternatively copy the one-time code and use **LearnLoop: Connect to LearnLoop AI** in the Command Palette.
6. Choose an exercise on LearnLoop and click **เปิดโจทย์ใน VS Code**. Or use **LearnLoop: Open Coding Exercise**.
7. Write `solve(input)`, then run **LearnLoop: Run Tests and Sync Results** from the Command Palette or status bar.
8. View results and AI Tutor on the website (the website refreshes periodically).

**No exercise files are downloaded.** You can save the untitled editor as a regular file if you want to keep your work. Closing an unsaved editor may lose your draft.

## Safety
- The extension connects only to `http://localhost` or `http://127.0.0.1` and stores the device token using VS Code SecretStorage.
- Pairing codes are one-time, valid for 10 minutes; device tokens expire after 30 days.
- Tests execute learner-authored JavaScript in a separate local Node.js process with time and memory limits. **Node's VM is not a security sandbox.** Run only code you trust; Workspace Trust is required.
- Code and test results are uploaded only when you explicitly run tests. Review the code in the editor first.
- Network failures keep one pending submission locally; retry using **LearnLoop: Retry Sync**.
- The existing .mjs download workflow remains available as a fallback.
