# Servicio de Fotos para Eventos (Polaroids)

Este es un backend en Node.js y Express desplegado en AWS. Permite crear eventos (bodas, fiestas), subir fotos que automáticamente se procesan con un marco tipo Polaroid y texto, y descargar un archivo ZIP con todas las fotos de un evento.

## Arquitectura y Tecnologías
- **EC2**: Servidor de la aplicación Node.js utilizando un `LabInstanceProfile`.
- **RDS (MySQL)**: Almacenamiento de metadatos de eventos y fotos.
- **S3**: Almacenamiento de fotos originales (carpeta `pictures/`) y procesadas (carpeta `polaroids/`).
- **Secrets Manager**: Gestión segura de las credenciales de la base de datos.

## Cómo correr el proyecto

1. Clonar el repositorio:
   `git clone https://github.com/CarlosCervantes-pi/traea_bodas.git`
2. Instalar dependencias:
   `npm install`
3. Arrancar el servidor (requiere puerto 80):
   `sudo node index.js`

## Limpieza de recursos (Teardown)
Para eliminar los recursos de AWS y evitar cargos, detén el servidor y ejecuta el script incluido:
`bash teardown.sh`
