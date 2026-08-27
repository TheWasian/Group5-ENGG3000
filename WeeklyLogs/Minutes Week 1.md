---
Unit: Eng3000 
Group: Group 5
Date: 2026-07-29
---

# 🖊️Project Overview:

**Unit:** Eng3000
**Topic:** Whack a moll

# Attendance (Present / Absent)

| Name                    | Student ID | Discipline | Team Roles (this week) | Attendance<br><br>(P / A) |
| ----------------------- | ---------- | ---------- | ---------------------- | ------------------------- |
| Alleluya Hamisi (Alley) | 48455032   | SE         | Minutes Taker          | p                         |
| Matthew Thompson        | 48234559   | SE         | Engineer               | p                         |
| Fouad Ayoub             | 48421650   | SE         | Engineer               | p                         |
| Cammilus John Baptist   | 48322288   | EE         | Scrum Master           | p                         |
| Shreenidhi Arunachalam  | 48552453   | SE         | Engineer               | P                         |
## Scrum Board
![[scrumweek1.png]]

## Sprint Backlog
|                                  |              |                         |                                                                                                                                                                                                                                                                                                                                    |                          |
| -------------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Task ID                          | No. Subtasks | Project Status          | Issues / Solution                                                                                                                                                                                                                                                                                                                  | Assignee                 |
| Code GUI                         | 3            | 2 subtasks in progress  | ¨     Conceptual plan reconfigured due to change in project outline<br><br>¨     Resolved by creating a MVP approach to front end design (skeleton level design), reducing the risk of fixating into a specific format                                                                                                             | Fouad<br><br>[girl name] |
| Program ESP32 Access Point       | 2            | 1 sub task in progress  | ¨     Discovering ESP32 limitations (range & inconsistency), project scope changes and budget constraints.<br><br>¨     Wireless requirements and latency concerns introduced<br><br>¨     Pivoted to a PCB and wireless system design, while finalising c as the primary language.                                                | Matthew                  |
| Game logic (Backend)             | 6            | 2 sub tasks in progress | ¨     Introducing latency and complexity concerns in relation to the revising project scope outlined by our client.<br><br>¨     Pivoted to a streamlined Api approach to integrate HTML,CSS & JavaScript. May also require more system and unit testing to reduce latency.                                                        | Alley                    |
| Electrical Design & Proto Typing | 3            | 1 sub task in progress  | ¨     Initial electrical design didn’t fully meet client requirements and due to a more refined client overview and requirement will require a rework.<br><br>¨     Upon refining client needs a PCB design has been perceived as the best alternative for wireless compared to ESP32. Although this may increase budget concerns. | [EE team members name]   |
## Sprint Actions (This week)
|                                 |                                  |                   |             |
| ------------------------------- | -------------------------------- | ----------------- | ----------- |
| Sub Task ID                     | Main Task                        | Estimation (days) | Assignee    |
| Add basic scoreboard system     | Code GUI                         | 7                 | Fouad       |
| Add lose/win screen             | Code GUI                         | 7                 | Fouad       |
| GUI levels + GUI rewards        | Code GUI                         | 7                 | [Girl name] |
| Scoring /Scoreboard (Backend)   | Game logic (Backend)             | 7                 | Alley       |
| Mole Generation Logic (Backend) | Game logic (Backend)             | 7                 | Alley       |
| Create basic Access point       | Program ESP32 Access Point       | 7                 | Matthew     |
| Redesign PCB layout             | Electrical Design & Proto Typing | 7 – 10            | [EE name]   |
## Weekly Scrum

Date | Yesterday | Today | Blockers | Cross-team dependency

## Meeting Notes

	-  The customer wants us to make the game components wireless

	-  The customer wants to only use 2 boxes at the minimum and an infinite amount if needed but they want to remain within the $100 budget
		
		o   The budget only works for 3 boxes at best
		
		o   The boxes need to be 10cm apart at minimum
		
		o   The boxes need to have triangulation (mathematical formula for complexity)
		
		o   To remain in budget, we will need to laser print boxes to reduce cost
		
		o   Boxes must be on the floor but can be raised a bit (still ironing out these requirements with the client)

	-  The customer wants us to only have a 1m x 1.5m radius of scanning for the ultra-sonics
	
		o   Ultra sonics has a reduced radius on no reflective material i.e cloths (may require us to give players a foil armor plate
		
		o   Ultra sonics cost $5 each
		
		o   Ultra sonics have a short wide view may require us to put multiple to reduce blind spots

	- Some of our team know HTML, CSS and JS better then C++ resulting in us using an application approach with an API stream to reduce the need of coding directly on the PCB but using the PC as both the home for the game logic and Access point.
	
	- The initial MVP is not expected to be perfect just need to have some form of functionality even if it isn’t all integrating but works independently from one another.

## Testing

	- Software need to do some unit testing to ensure that section works (backend logic testing the code is applicable)
	
	- Access point needs to be tested to ensure at least 1 device is connected
	
	- PCB design can’t be tested until built but it can be reviewed by supervisor to ensure it is applicable for the clients requirements prior to contracting (reduce the risk of building the wrong PCB that doesn’t meet client needs)
	
	- GUI doesn’t need to be unit tested but might require external review to ensure it is easy for a user to understand the UI and the game objective

## Sprint Review

	- Everyone is expected to have something prior to the Tuesday workshop
	
	- We will be reviewing the UI code to ensure at least some components have been designed and is ready to code or has at least a skeleton or sketch out of the potential code
	
	- The PCB isn’t expected to be complete, but a sketch or potential design is expected to be drafted
	
	- The Access point isn’t expected to be complete since the ESP32 currently doesn’t have an antenna, but the skeleton of the code is expected to be ready for our prototype PCB to be able to use in the coming fortnight workshop

## Sprint Retrospective

We had a proactive and in-depth debrief of all the events that occurred in the workshop and outlined some tasks and expectoration each member will be needing to do and some potential methods of contact if someone requires assistance or information from our other members.