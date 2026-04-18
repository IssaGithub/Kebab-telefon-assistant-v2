locals {
  common_labels = {
    app         = "kebab-telefon-assistant"
    managed_by  = "terraform"
    environment = "production"
  }

  app_user_data = templatefile("${path.module}/templates/cloud-init-app.yaml.tftpl", {
    deploy_user        = var.deploy_user
    repo_checkout_path = var.repo_checkout_path
  })

  db_user_data = templatefile("${path.module}/templates/cloud-init-db.yaml.tftpl", {
    deploy_user        = var.deploy_user
    repo_checkout_path = var.repo_checkout_path
    app_private_ip     = var.app_private_ip
  })
}

resource "hcloud_ssh_key" "admin" {
  count      = length(var.ssh_public_keys)
  name       = "${var.project_name}-admin-${count.index + 1}"
  public_key = var.ssh_public_keys[count.index]
  labels      = local.common_labels
}

resource "hcloud_network" "private" {
  name     = "${var.project_name}-private"
  ip_range = var.network_ip_range
  labels   = local.common_labels
}

resource "hcloud_network_subnet" "private" {
  type         = "cloud"
  network_id   = hcloud_network.private.id
  network_zone = var.network_zone
  ip_range     = var.subnet_ip_range
}

resource "hcloud_firewall" "app" {
  name   = "${var.project_name}-app-fw"
  labels = local.common_labels

  lifecycle {
    precondition {
      condition     = length(concat(var.admin_ingress_ipv4, var.admin_ingress_ipv6)) > 0
      error_message = "Provide at least one admin_ingress IPv4 or IPv6 CIDR for SSH access."
    }
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = concat(
      var.admin_ingress_ipv4,
      var.admin_ingress_ipv6
    )
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_firewall" "db" {
  name   = "${var.project_name}-db-fw"
  labels = local.common_labels

  lifecycle {
    precondition {
      condition     = length(concat(var.admin_ingress_ipv4, var.admin_ingress_ipv6)) > 0
      error_message = "Provide at least one admin_ingress IPv4 or IPv6 CIDR for SSH access."
    }
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = concat(
      var.admin_ingress_ipv4,
      var.admin_ingress_ipv6
    )
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "5432"
    source_ips = ["${var.app_private_ip}/32"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "6379"
    source_ips = ["${var.app_private_ip}/32"]
  }
}

resource "hcloud_server" "app" {
  name        = "app-01"
  server_type = var.app_server_type
  image       = var.server_image
  location    = var.location
  ssh_keys    = hcloud_ssh_key.admin[*].name
  labels      = merge(local.common_labels, { role = "app" })
  user_data   = local.app_user_data

  public_net {
    ipv4_enabled = true
    ipv6_enabled = var.enable_ipv6
  }

  firewall_ids = [hcloud_firewall.app.id]
}

resource "hcloud_server" "db" {
  name        = "db-01"
  server_type = var.db_server_type
  image       = var.server_image
  location    = var.location
  ssh_keys    = hcloud_ssh_key.admin[*].name
  labels      = merge(local.common_labels, { role = "db" })
  user_data   = local.db_user_data

  public_net {
    ipv4_enabled = true
    ipv6_enabled = false
  }

  firewall_ids = [hcloud_firewall.db.id]
}

resource "hcloud_server_network" "app" {
  server_id  = hcloud_server.app.id
  network_id = hcloud_network.private.id
  ip         = var.app_private_ip
}

resource "hcloud_server_network" "db" {
  server_id  = hcloud_server.db.id
  network_id = hcloud_network.private.id
  ip         = var.db_private_ip
}
