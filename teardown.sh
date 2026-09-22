#!/bin/bash
# Reemplaza esto con el nombre de tu bucket cuando lo crees
BUCKET_NAME="bodas-fotos-carlos-12345"

echo "Eliminando S3..."
aws s3 rm s3://$BUCKET_NAME --recursive
aws s3api delete-bucket --bucket $BUCKET_NAME

echo "Eliminando RDS y Secrets..."
aws rds delete-db-instance --db-instance-identifier bodasdb --skip-final-snapshot
aws secretsmanager delete-secret --secret-id db-secret --force-delete-without-recovery

echo "¡Recursos eliminados! Ya puedes borrar la EC2 manualmente en la consola."
