# PDF-LABS Microservice Project

This repository contains the ongoing development of **PDF-LABS**, a microservice-based application designed to handle various PDF-related tasks. Each microservice is developed in its own branch, following best practices in **DevOps** and **microservice architecture**.

## Project Structure

The project is structured into multiple services, each residing in a dedicated branch:

- `home-service`
- `account-service`
- `profile-service`
- `logout-service`

## DevOps Practices

This project embraces core DevOps principles for continuous integration and deployment. Each branch is equipped with its own **Dockerfile** and **Jenkinsfile** to ensure seamless builds, testing, and deployments. The following are key DevOps elements implemented in this project:

- **Docker**: All services are containerized using Docker, enabling easy portability and consistency across environments.
- **Jenkins**: CI/CD pipelines are managed via Jenkins, automating build, test, and deployment processes for each microservice.
- **Version Control**: Each service is developed and managed in its respective Git branch to maintain modularity and separation of concerns.
- **Kubernetes** (Planned): Future deployment will use Kubernetes for orchestration of the containerized services, ensuring scalability and resilience.

## Current Status

This project is under active development. I am currently focusing on setting up the CI/CD pipeline and integrating all the services using containerization techniques.

### Planned Features:
- PDF to Audio Conversion
- PDF to Word Conversion
- PDF Compression
- Profile Management and User Settings
- OAuth2 and JWT-based Authentication

### CI/CD Pipeline Highlights:
- **Dockerfiles**: Each service branch includes a custom Dockerfile for containerized builds.
- **Jenkinsfiles**: Automated build and deployment pipelines are configured for each branch to ensure continuous integration and delivery.
- **Automated Testing**: Unit and integration tests are integrated into the CI pipeline.

---

For any inquiries or to report issues, please contact me via [GitHub Issues](https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/issues).
