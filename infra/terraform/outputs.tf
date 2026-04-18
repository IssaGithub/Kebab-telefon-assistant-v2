output "app_public_ipv4" {
  description = "Public IPv4 of app-01."
  value       = hcloud_server.app.ipv4_address
}

output "app_public_ipv6" {
  description = "Public IPv6 network of app-01."
  value       = hcloud_server.app.ipv6_address
}

output "app_private_ip" {
  description = "Private IP of app-01."
  value       = var.app_private_ip
}

output "db_public_ipv4" {
  description = "Public IPv4 of db-01."
  value       = hcloud_server.db.ipv4_address
}

output "db_private_ip" {
  description = "Private IP of db-01."
  value       = var.db_private_ip
}

output "private_network_id" {
  description = "Hetzner private network ID."
  value       = hcloud_network.private.id
}
