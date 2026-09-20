The hardest problem was making the live feed and the REST API agree about who is allowed to see what. My first idea was a Socket.io room per project, but that leaks: a developer in a project room would receive every teammate's task events. So I dropped project rooms. Each socket joins a private user room (admins also join one admin room), and when a task changes the server works out the audience (admins, the project's PM, and the task's current assignee) and emits only to those rooms. The same rules live in one file, access/scope.ts, which also builds the Prisma filters for REST, so the catch-up query and the live push can't drift apart.

Each change writes the task update, the activity row and any notifications in one transaction, and only publishes after it commits. "Missed events" never touch memory: I store lastSeenAt when a user's last socket closes, and /activity/missed reads everything newer from Postgres, latest 20 plus a total.

The API also loads the role from the database on every request instead of trusting the JWT claim, and refresh tokens rotate with reuse detection.

What I'd do differently: presence and socket fan-out live in one process's memory, so scaling out means adding the Socket.io Redis adapter. I'd also write the automated tests earlier instead of after the features.
