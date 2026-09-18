# Week 1 : Defining the SHG Module and Its Data Requirements

# SHG Requirements and Data Design

## Objective

The assigned responsibility was to work on the Self-Help Group (SHG) portion of the CreditSetu system, covering its data requirements, backend functionality, frontend dashboard, and integration with lender-related functionality.

## Relevant Context

The SHG module has to operate within a system containing multiple roles. An authenticated SHG should be able to view information related to its own group, including its members, group-level statistics, credit information, and linked lenders.

This meant that the SHG module could not be designed only as a frontend dashboard. The required data relationships and access restrictions had to be considered along with the user interface.

## Key Observation

The main SHG requirements identified were:

- SHG profile information
- Village and district information
- Number of members
- Member credit scores
- Group repayment statistics
- Group attendance statistics
- Linked lenders
- SHG-lender partnership requests

The access model was also an important part of the design. An SHG user should be able to access its own SHG information without being able to access information belonging to unrelated SHGs.

## Solution

The SHG module was divided into three layers:

1. Database/model layer
2. FastAPI backend layer
3. React frontend layer

The backend was planned as the interface between the frontend and database. The React dashboard would obtain SHG information through REST APIs instead of accessing the database directly.

The main relationships required by the module were between an SHG and its members, member credit information, and lender relationships.

## Because

Separating the module into data, backend, and frontend layers makes the responsibilities of each component clear and allows access control to be enforced at the backend rather than relying only on the frontend.

The initial requirements and data relationships established in this stage were used as the basis for the subsequent SHG backend and dashboard work.