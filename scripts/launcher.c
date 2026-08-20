// Mach-O stub used as CFBundleExecutable for the Spotlight launcher apps.
//
// Two things here are deliberate and both are about TCC:
//
// 1. This is a compiled binary, not a shell script. macOS runs a script-based
//    bundle executable through /bin/bash, and TCC then attributes file access
//    to `com.apple.bash` rather than to the bundle -- so a Full Disk Access
//    grant on the .app never matches, and reads under ~/Documents fail with
//    exit 126 and no visible error.
//
// 2. The helper script is run in a forked CHILD, not exec'd over this process.
//    exec would replace this binary with /bin/bash in the same pid, losing the
//    app's code identity again. A child instead inherits this app as its
//    responsible process, so the grant applies to it.
//
// Build with scripts/build-launchers.sh.

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

static void alert(const char *message) {
    char script[1024];
    snprintf(script, sizeof(script),
             "display alert \"%s\" message \"%s\" as critical", APP_NAME, message);
    pid_t pid = fork();
    if (pid == 0) {
        execl("/usr/bin/osascript", "osascript", "-e", script, (char *)NULL);
        _exit(127);
    }
    if (pid > 0) {
        int status;
        waitpid(pid, &status, 0);  // stay alive until the alert is dismissed
    }
}

int main(void) {
    pid_t pid = fork();
    if (pid < 0) {
        alert("Could not fork a process to run the helper script.");
        return 1;
    }

    if (pid == 0) {
        execl(SCRIPT_PATH, SCRIPT_PATH, (char *)NULL);
        _exit(errno == EACCES || errno == EPERM ? 126 : 127);
    }

    int status = 0;
    waitpid(pid, &status, 0);

    if (WIFEXITED(status) && WEXITSTATUS(status) == 126) {
        alert("Could not read the helper script in ~/Documents (permission "
              "denied).\n\nGrant this app Full Disk Access in System Settings > "
              "Privacy & Security, then try again.");
        return 126;
    }
    if (WIFEXITED(status) && WEXITSTATUS(status) == 127) {
        alert("The helper script could not be found or started.\n\n"
              "Expected it at:\n" SCRIPT_PATH);
        return 127;
    }
    return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
