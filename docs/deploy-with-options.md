To keep things perfectly clear, you should always use ./deploy-with-options.sh for both development and production. Running raw deploy.sh directly bypasses the setup logic that pieces together your docker/ folder overrides, which can lead to unpredictable configuration state mismatches.

Here is exactly how to use the wrapper options for both scenarios and what all the other flags do:

1. Production Deployment (On your remote server)
When deploying to production, run:

Bash
./deploy-with-options.sh --production
What this does: It locks $APP_ENV to production, ignores development compose layers, builds optimized frontend assets, and triggers production-safe Laravel optimization commands (config:cache, route:cache).

2. The Dev Flags Explained
When developing locally or on a development environment (like your semiendebub folder on the Pi), you append flags to --development depending on what state you want to toggle:

-f or --force-build

When to use: Use this if you just changed something inside your docker/Dockerfile.dev or updated system packages. It forces Docker to rebuild the structural container images instead of reusing cached image layers.

Example: ./deploy-with-options.sh --development --force-build

-r or --reset-db

When to use: Use this when you want a completely pristine database state. It will wipe all your tables, run all migrations fresh, and populate the system with your development seed data (mock records, default assets, user entries).

Example: ./deploy-with-options.sh --development --reset-db

-o or --observability

When to use: Use this to turn on your performance monitoring, metrics telemetry, and error-catching services (LGTM stack + GlitchTip) to inspect logs or trace API performance locally.

Example: ./deploy-with-options.sh --development --observability

-c or --clean

When to use: The "nuke" switch. Use this if you are encountering stubborn volume caching errors, corrupted storage sessions, or database lockouts. It wipes all persistent Docker volumes bound to the project before bringing up clean instances.

Example: ./deploy-with-options.sh --development --clean

-l or --logs

When to use: Use this to automatically tail the real-time runtime log files for all your running services right after the deployment script finishes executing.

Example: ./deploy-with-options.sh --development --logs

Summary Recommendation:
Standard Daily Run: ./deploy-with-options.sh --development

When you pull heavy database changes: ./deploy-with-options.sh --development --reset-db

When Docker files or underlying dependencies alter: 



Works for sure on 2026.07.10
on production -> sudo bash deploy-with-options.sh --production

zerothir one ubuntu addreess
ssh starvin@10.216.254.10