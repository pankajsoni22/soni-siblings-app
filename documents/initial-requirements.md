# About
I run a business, in which we lent our money to our customers for very short time period say 2 hours or 6 hours or so and charge them a fixed percentage commision. That commission we divide among multiple partners. I want to track every month how much total money we lent and against it how much we earned.

# Functional requirements
1. In this application there are two roles -> Admin & User-RO & User-W.
2. Admin's responsibility is controlling the application like add / remove partners, fix their share etc.
3. A user-ro has only read only view, they can check what happened in current month, quarter etc.
4. Having one admin is mandatory.
5. Admin can change the role of a user from user-w to user-ro or admin.
6. An admin / user-w has permission to make new entries everyday (one or multiple) that has
- Transaction date: default to current date but can be changed.
- Customer Name
- Amount Lent
- Commission Rate: Default to 0.30 %: As soon as we enter commission rate and amount, total commission should reflect on UI.
- Each partner's share: Default to (Commission Rate) / (Total Partners): As soon as we enter Each partner's share, each partners share should be visible on screen in front of their names (You can decide the UI)
- Application should track who made this entry and when.
- Admin / user-w can edit / delete the transactions (but should be tracked who deleted it)
7. Application should be able to select time range and show business activity for selected time period.


# Non-Functional requirements
1. Use google sheets as backend store.
2. Application should be secure, only admin can see the backend sheets no one else.
3. Only allowed people should be able to use this application. If an email is not listed in allowed list should not be able to login and use the application.
4. High class user experience.
5. Data is well written on backend acknowledge well on the UI.
6. Application should follow the best fit design patterns and principles. So that adding any features tomorrow shouldn't break it.