# Tournament Organization Player Ban Feature

## Requirements
- Tournament organizations need to ban players
- Banned players can't create new teams or join existing teams in tournaments
- Organizations should be able to add a private note explaining the ban reason
- Need a way to manage (view/add/remove) bans
- Need to update tournament registration logic to check for banned players

## Database Schema
- [x] Create a new table `TournamentOrganizationBannedUser` with columns:
  - `organizationId` - Foreign key to TournamentOrganization
  - `userId` - Foreign key to User
  - `reason` - Text field for private notes about the ban reason
  - `createdAt` - Timestamp when the ban was created

## Backend Implementation
- [x] Create a migration file for the new table (migrations/089-tournament-org-banned-players.js)
- [x] Update database type definitions to include the new table
- [x] Update the TournamentOrganizationRepository to add functions:
  - `banUser` - Add a player to the banned list
  - `unbanUser` - Remove a player from the banned list
  - `allBannedPlayersByOrganizationId` - List all banned players for an organization
  - `isPlayerBannedByOrganization` - Check if a player is banned by a specific organization
- [x] Update tournament action functions to check for bans:
  - Update team creation logic to verify creator is not banned
  - Update team join logic to verify joining player is not banned

## Frontend Implementation
- [x] Add new tab to the /org/:slug page for managing banned players
  - Should only be visible if you have "BAN" permissions for the organization
- [x] Render banned players via the Table.tsx component

## Testing
- [ ] Create E2E test to verify:
  - Organizations can add a ban and the banned player can't create a new team for their tournament

## Documentation
- [x] Update database-relations.md documentation
