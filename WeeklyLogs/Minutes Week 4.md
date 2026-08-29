---
tags:
  - eng3000
  - minutes
  - scrum
date: 2026-08-21
sprint: Week 4
minute_taker: Alleluya Hamisi
---

# 🛠️ ENG3000 — Scrum Minutes: Week 4

## Project Overview
- **Project name:** Whack a moll
- **Course:** ENG3000
- **Sprint / Week #:** 4
- **Minute Taker:** Alleluya Hamisi

## Attendance
| Name                    | Student ID | Discipline | Role This Week | Attendance (P/A) |
| ----------------------- | ---------- | ---------- | -------------- | ---------------- |
| Alleluya Hamisi (Alley) | 48455032   | SE         | Minutes Taker  | p                |
| Matthew Thompson        | 48234559   | SE         | Engineer       | p                |
| Fouad Ayoub             | 48421650   | SE         | Scrum Master   | p                |
| Cammilus John Baptist   | 48322288   | EE         | Engineer       | p                |
| Shreenidhi Arunachalam  | 48552453   | SE         | Engineer       | P                |

## Scrum Board Snapshot
![[Dash.png.png|700]]

| Task ID                          | No. Subtasks | Project Status                                      | Issues / Solution                                                                                                                    | Assignee                |
| -------------------------------- | ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Code GUI                         | 5            | 3 subtask done<br><br>2 Subtask in progress         | No major issue this week, just minor design and backend logic connections                                                            | Fouad<br><br>Shreenidhi |
| Program ESP32                    | 4            | 3 sub task Complete<br><br>1 sub task newly created | -There was no major issue, just api fething delays and sensors being finetuned.                                                      | Matthew                 |
| Game Logic (Backend)             | 7            | 2 sub tasks in progress<br><br>2 sub tasks complete | There was no major issues, just a few minor api call issue and backend logic looping too much.<br>                                   | Alley                   |
| Electrical Design & Proto Typing | 3            | 2 sub task complete<br><br>1 sub task in progress   | The design of the sensor stand was printed but the tunnel cones were printed out slightly wrong might not be fully ready for the MVP | Cammilus                |

## Sprint Backlog (subtasks committed this sprint)
| Sub Task                                                         | Main Task                        | Estimation (days) | Assignee           | Done?                                        |
| ---------------------------------------------------------------- | -------------------------------- | ----------------- | ------------------ | -------------------------------------------- |
| Fix new HTML/CSS to align with the existing ESP32 game logic     | Code GUI                         | 7                 | Shreenidhi + Fouad | Done                                         |
| Add Different type of moles                                      | Code GUI                         | 7                 | Fouad              | Done                                         |
| Add Speed increase depending on level                            | Game logic (Backend)             | 7                 | Fouad + Alley      | Particialy fixed, will need to be overhauled |
| Create Simple components for the MVP (Stand)                     | Electrical Design & Proto Typing | 7                 | Cammilus           | Done                                         |
| Add Multi Core Calculation (Building block toward triangulation) | Program ESP32                    | 7                 | Matthew            | Done                                         |


## Sprint Actions (goals for this week)
- [ ] Fix any minor issues found before the MVP
- [ ] Attempt to make a new cone before the MVP (time sensitive)
- [ ] Give each other all the photos and details needed so everyone can do their report

## Meeting Notes
> Client requirements, design decisions, budget/scope discussion, constraints raised.
- We were focused on trying to get anything we possible could do safely without breaking the code or the function done this week this meant abonding big updates like differnet moles, comprehensive leveling system and potential triangulation. 
- We made it clear that the assignment report is going to be next week main task meaning we might not see much progress with the assignment in week 5 but will need to work harder in week 6 to ensure were on track'
- Anyone with photos or testing details need to share it on discord to allow other to be able to use it for their assignment

## Testing Updates
| Test ID | Component Tested             | Result | Owner                        | Status   |
| ------- | ---------------------------- | ------ | ---------------------------- | -------- |
| T-11    | API Interval fetch Test      | Pass   | Alley, Fouad                 | Complete |
| T-12    | Position Error Handling Test | Pass   | Matthew, Fouad               | Complete |
| T-13    | Distance Tests Test          | Pass   | Mathew, Cammilus, Shreenidhi | Complete |

## Sensor distance calculation

The formula Matthew used was a simple distance collocation at first 
### $d=2√t×v​​$
### $d=2√t×343​​$
- d = distance 
- t = echo travel time
- v = speed of sound (343m/s)
- 2 = divided by 2 due to communicating with hardware and api fetch 

### Distance Tests (on the table without a stand / cone)

| Test | Distance from sensor | Detection result       | Observation                                                                                         |
| ---- | -------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | 10 cm                | Unreliable             | Sensor becomes unstable when player is too close, detecting the player on both sides                |
| 2    | 30 cm                | Unreliable             | Significant fluctuations in readings, still detecting players on both sides                         |
| 3    | **50 cm**            | Reliable               | Consistent detects player on their chosen sensor (left / right)                                     |
| 4    | 70 cm                | Reliable               | Stable detection                                                                                    |
| 5    | 90 cm                | Reliable               | Stable detection                                                                                    |
| 6    | **1.0 m**            | slightly less Reliable | Good detection across repeated tests, athough minor detection error did appear within this distance |
| 7    | 1.2 m                | Mostly reliable        | Slight reduction in detection consistency, more then 1 or 2 minor errors like previous test         |
| 8    | **1.4 m**            | Reduced                | Noticeable drop in detection reliability                                                            |
| 9    | **1.5 m**            | Reduced                | Detection still possible but less consistent, might need a cone or stand to improve detection       |
| 10   | 1.75 m               | Poor                   | Significant detection drop                                                                          |
The test in conculsion indicated the minimum range would be 50cm. The ultrasonic reading became more unreliable the longer the range although there was no stand or cone utilised within this test leaving us to presume that if the sensors were raised off the ground and the cones hyper focus the sensors then there could be a drastic increase of performance epsecially around 1.2m to 1.5m. 

There for in the MVP we will be focused on working around this error but in the following week 9 presentation we will need to ensure this is address and tested again to see the reliabily with the said assisted 3D printed parts.

### Position Error Handling (on the table without a stand / cone)
This test was conducted without the 3D printed components and focused on:
### $RMS = √(Σ error² / n)$
RMS = Root Mean Squared

### ${RMS > 0.75m \rightarrow Reject \space Position}$

| RMS result | System response |
| :--------: | :-------------: |
|   0.18 m   |    Detected     |
|   0.35 m   |    Detected     |
|   0.50 m   |    Detected     |
|   0.70 m   |    Detected     |
| **0.75 m** |    Detected     |
| **0.80 m** |   Unreliable    |
|   1.00 m   |   Unreliable    |
In the backend we are testing for the error handling across all available sensors. Finding the range in which the system will detect as too large for it to be counted as a human, deciding that the error of 0.75m was acceptable and anything greater then that was unreliable there for will be rejected and not counted as a human being detected but instead be counted as an error.


### API Interval fetch Test (on the table without a stand / cone)

### $100ms \div Nms​=N$

| Test | Poll Interval | Request/sec | Result                                                                                                        |
| ---- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | 25 ms         | 40/s        | Very frequent requests but the data is not correct as it fetchets too fast                                    |
| 2    | 50 ms         | 20/s        | Very responsive but the traffic is way too higher traffic resulting in a weird response on our UI side        |
| 3    | 75 ms         | 13.3/s      | Responsive and had a decent moderate traffic ensuring our UI has enough time to do the animations             |
| 4    | **100 ms**    | **10/s**    | Good responsiveness, finding the more animations we added it didn't hurt our load balance (optimal)           |
| 5    | 150 ms        | 6.7/s       | Slightly slower updates but there was no issue with the information and no UI animations were effected either |
| 6    | 200 ms        | 5/s         | More noticeable delay for updating, since it taking almost 3 min + to get the data                            |
| 7    | 250 ms        | 4/s         | Too slow for player tracking for the different levels and other function we want to add                       |

## Sprint Retrospective
- What went well:
	  - We were able to get all the tests done but there was errors and flaws we found in the test that we could not get fixed before the presentation but has been flaged for the next presentation in week 9
- What to improve:
	  - We need to improve our error handling
	  - We need to implement a working triangulation after week 5
	  - The backend game logic need to be overhauled as the api fetch showed that the UI animation is slowing down our responses which it shouldn't be
- Support needed from other members:
	  - Alley had car issues and was unable to be present at the workshop but was able to call in and listen to the tests and many more things.


## Next Meeting
- **Date:** 28/08/2026
- **Location/Platform:** Discord

---
